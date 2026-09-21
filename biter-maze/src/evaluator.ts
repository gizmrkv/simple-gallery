// 集団の評価を worker プールに散らす。
//
// 決定性の要: worker は純関数なので、結果を first+index で再組み立てしさえすれば
// 完了順・worker 数に依存しない。したがって動的負荷分散を自由に使える
// （迂回の長い迷路は A* の展開数が数倍になるため、静的分割だと遅いチャンクで待たされる）。
import { Pathfinder } from "./pathfinder.ts";
import { evaluateChunk } from "./fitness.ts";
import { STATS_STRIDE, type FitnessParams, type PathParams } from "./types.ts";
import type { EvalRequest, EvalResponse } from "./eval.worker.ts";

/** Reset やパラメータ変更でジョブを破棄したときの理由。これだけは握りつぶしてよい。 */
export const EVAL_ABORTED = "eval-aborted";

/**
 * 集団バッファの配置と盤面サイズが食い違っていないか確かめる。
 * 食い違うと TypedArray の subarray は例外を投げずに範囲をクランプするので、
 * 個体の境界をまたいだゴミを黙って評価し続けることになる。必ず落とす。
 */
export function assertLayout(pop: Uint8Array, popSize: number, w: number, h: number): void {
  const expected = popSize * w * h;
  if (pop.length !== expected) {
    throw new Error(
      `集団バッファのサイズが盤面と食い違っている: ${pop.length} bytes, ` +
        `期待値 ${expected} (popSize=${popSize}, ${w}x${h})`,
    );
  }
}

export interface Evaluator {
  readonly workerCount: number;
  evaluate(
    pop: Uint8Array,
    popSize: number,
    w: number,
    h: number,
    path: PathParams,
    fit: FitnessParams,
  ): Promise<Float64Array>;
  dispose(): void;
}

/** mainスレッドで同期評価する。テスト用、および worker を作れない環境のフォールバック。 */
export class SyncEvaluator implements Evaluator {
  readonly workerCount = 0;
  private pf: Pathfinder | null = null;
  private out: Float64Array = new Float64Array(0);

  async evaluate(
    pop: Uint8Array,
    popSize: number,
    w: number,
    h: number,
    path: PathParams,
    fit: FitnessParams,
  ): Promise<Float64Array> {
    assertLayout(pop, popSize, w, h);
    if (!this.pf || this.pf.w !== w || this.pf.h !== h) this.pf = new Pathfinder(w, h);
    if (this.out.length !== popSize * STATS_STRIDE) {
      this.out = new Float64Array(popSize * STATS_STRIDE);
    }
    evaluateChunk(this.pf, pop, popSize, path, fit, this.out);
    return this.out;
  }

  dispose(): void {}
}

interface Job {
  out: Float64Array;
  queue: { first: number; count: number }[];
  pending: number;
  token: number;
  pop: Uint8Array;
  n: number;
  w: number;
  h: number;
  path: PathParams;
  fit: FitnessParams;
  resolve: (v: Float64Array) => void;
  reject: (e: unknown) => void;
}

export class WorkerEvaluator implements Evaluator {
  readonly workerCount: number;
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private job: Job | null = null;
  private nextMsgId = 1;
  private token = 0;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const wk = new Worker(new URL("./eval.worker.ts", import.meta.url), { type: "module" });
      wk.onmessage = (e: MessageEvent<EvalResponse>) => this.onMessage(wk, e.data);
      this.workers.push(wk);
      this.idle.push(wk);
    }
    this.workerCount = this.workers.length;
  }

  /** 生成に失敗する環境（拡張機能やポリシーでブロックされる等）では同期評価に落ちる。 */
  static create(count: number): Evaluator {
    try {
      return new WorkerEvaluator(count);
    } catch {
      return new SyncEvaluator();
    }
  }

  evaluate(
    pop: Uint8Array,
    popSize: number,
    w: number,
    h: number,
    path: PathParams,
    fit: FitnessParams,
  ): Promise<Float64Array> {
    assertLayout(pop, popSize, w, h);
    // 走行中のジョブがあれば破棄する（パラメータ変更・リセット時）。
    this.token++;
    if (this.job) this.job.reject(new Error(EVAL_ABORTED));

    // チャンク数は worker 数の2倍。空いた worker に1つずつ投入して動的に均す。
    const chunks = Math.max(1, Math.min(popSize, this.workerCount * 2));
    const base = Math.floor(popSize / chunks);
    const rem = popSize % chunks;
    const queue: { first: number; count: number }[] = [];
    let first = 0;
    for (let i = 0; i < chunks; i++) {
      const count = base + (i < rem ? 1 : 0);
      if (count > 0) queue.push({ first, count });
      first += count;
    }

    return new Promise<Float64Array>((resolve, reject) => {
      const job: Job = {
        out: new Float64Array(popSize * STATS_STRIDE),
        queue,
        pending: 0,
        token: this.token,
        pop,
        n: w * h,
        w,
        h,
        path,
        fit,
        resolve,
        reject,
      };
      this.job = job;
      while (this.idle.length > 0 && job.queue.length > 0) {
        this.dispatch(this.idle.pop()!, job);
      }
    });
  }

  private dispatch(wk: Worker, job: Job): void {
    const chunk = job.queue.shift()!;
    const start = chunk.first * job.n;
    // 集団バッファ本体を transfer すると detach されてしまうので、必ずコピーを送る。
    const genomes = job.pop.slice(start, start + chunk.count * job.n).buffer as ArrayBuffer;
    const req: EvalRequest = {
      id: this.nextMsgId++,
      token: job.token,
      first: chunk.first,
      count: chunk.count,
      w: job.w,
      h: job.h,
      path: job.path,
      fit: job.fit,
      genomes,
    };
    job.pending++;
    wk.postMessage(req, [genomes]);
  }

  private onMessage(wk: Worker, res: EvalResponse): void {
    const job = this.job;
    if (!job || res.token !== job.token) {
      // 古いジョブの返信。破棄して worker をアイドルに戻す。
      this.idle.push(wk);
      return;
    }
    job.pending--;
    if (!res.ok) {
      this.idle.push(wk);
      this.job = null;
      job.reject(new Error(res.error));
      return;
    }
    job.out.set(new Float64Array(res.stats), res.first * STATS_STRIDE);
    if (job.queue.length > 0) {
      this.dispatch(wk, job);
    } else {
      this.idle.push(wk);
    }
    if (job.pending === 0 && job.queue.length === 0) {
      this.job = null;
      job.resolve(job.out);
    }
  }

  dispose(): void {
    this.token++;
    if (this.job) {
      this.job.reject(new Error(EVAL_ABORTED));
      this.job = null;
    }
    for (const wk of this.workers) wk.terminate();
    this.workers = [];
    this.idle = [];
  }
}

/** worker が返す [fitness, min, mean, breaks] の並びから fitness 列だけ取り出す。 */
export function extractFitness(stats: Float64Array, popSize: number, out: Float64Array): void {
  for (let i = 0; i < popSize; i++) out[i] = stats[i * STATS_STRIDE];
}
