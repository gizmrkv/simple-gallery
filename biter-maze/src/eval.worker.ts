// 純粋な評価器。乱数を一切使わないので、worker 数・完了順・マシンが変わっても
// 同じゲノムには同じ統計を返す。これが全体の決定性を支えている。
import { Pathfinder } from "./pathfinder.ts";
import { evaluateChunk } from "./fitness.ts";
import { STATS_STRIDE, type FitnessParams, type PathParams } from "./types.ts";

export interface EvalRequest {
  id: number;
  token: number;
  /** 集団内でのこのチャンクの先頭インデックス。返信の再組み立てに使う。 */
  first: number;
  count: number;
  w: number;
  h: number;
  path: PathParams;
  fit: FitnessParams;
  /** count*w*h バイト。transfer で渡る。 */
  genomes: ArrayBuffer;
}

export type EvalResponse =
  | { id: number; token: number; first: number; count: number; ok: true; stats: ArrayBuffer }
  | { id: number; token: number; first: number; count: number; ok: false; error: string };

// lib に DOM と WebWorker を併記しているため self は Window 型に寄ってしまう。
// transfer 付き postMessage を使うのでここで明示的に絞る。
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let pf: Pathfinder | null = null;

ctx.onmessage = (e: MessageEvent<EvalRequest>) => {
  const req = e.data;
  try {
    if (!pf || pf.w !== req.w || pf.h !== req.h) pf = new Pathfinder(req.w, req.h);
    const genomes = new Uint8Array(req.genomes);
    // 返信のたびに新しく確保する。transfer 後の ArrayBuffer は detach され再利用できない。
    const stats = new Float64Array(req.count * STATS_STRIDE);
    evaluateChunk(pf, genomes, req.count, req.path, req.fit, stats);
    const res: EvalResponse = {
      id: req.id,
      token: req.token,
      first: req.first,
      count: req.count,
      ok: true,
      stats: stats.buffer as ArrayBuffer,
    };
    ctx.postMessage(res, [res.stats]);
  } catch (err) {
    const res: EvalResponse = {
      id: req.id,
      token: req.token,
      first: req.first,
      count: req.count,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(res);
  }
};
