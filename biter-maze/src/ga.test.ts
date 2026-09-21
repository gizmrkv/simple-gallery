import { describe, it, expect } from "vitest";
import { Ga } from "./ga.ts";
import { Rng } from "./rng.ts";
import { SyncEvaluator, extractFitness, type Evaluator } from "./evaluator.ts";
import { Pathfinder } from "./pathfinder.ts";
import { evaluateChunk } from "./fitness.ts";
import {
  DEFAULT_FITNESS_PARAMS,
  DEFAULT_GA_PARAMS,
  DEFAULT_PATH_PARAMS,
  STATS_STRIDE,
  type GaParams,
} from "./types.ts";

const W = 16;
const H = 16;

/**
 * チャンクをランダムに刻み、ランダムな順序で評価して index で書き戻す評価器。
 * 実 worker を起こさずに「完了順に依存しない」という性質そのものを検証する。
 */
class ShuffledEvaluator implements Evaluator {
  readonly workerCount = 0;
  private pf = new Pathfinder(W, H);
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  async evaluate(
    pop: Uint8Array,
    popSize: number,
    w: number,
    h: number,
    path = DEFAULT_PATH_PARAMS,
    fit = DEFAULT_FITNESS_PARAMS,
  ): Promise<Float64Array> {
    const n = w * h;
    const out = new Float64Array(popSize * STATS_STRIDE);
    const chunks: { first: number; count: number }[] = [];
    let first = 0;
    while (first < popSize) {
      const count = Math.min(this.rng.range(1, 7), popSize - first);
      chunks.push({ first, count });
      first += count;
    }
    for (let i = chunks.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    for (const c of chunks) {
      const buf = new Float64Array(c.count * STATS_STRIDE);
      evaluateChunk(this.pf, pop.subarray(c.first * n, (c.first + c.count) * n), c.count, path, fit, buf);
      out.set(buf, c.first * STATS_STRIDE);
    }
    return out;
  }

  dispose(): void {}
}

function hashPopulation(ga: Ga): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < ga.population.length; i++) {
    hash ^= ga.population[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

async function run(
  evaluator: Evaluator,
  generations: number,
  over: Partial<GaParams> = {},
): Promise<{ ga: Ga; best: number[] }> {
  const params: GaParams = { ...DEFAULT_GA_PARAMS, popSize: 40, ...over };
  const ga = new Ga(W, H, params);
  const fitness = new Float64Array(params.popSize);
  const best: number[] = [];
  for (let g = 0; g < generations; g++) {
    const stats = await evaluator.evaluate(
      ga.population,
      params.popSize,
      W,
      H,
      DEFAULT_PATH_PARAMS,
      DEFAULT_FITNESS_PARAMS,
    );
    extractFitness(stats, params.popSize, fitness);
    best.push(Math.max(...fitness));
    ga.advance(fitness);
  }
  return { ga, best };
}

describe("Ga", () => {
  it("評価の完了順やチャンク分割に依存しない", async () => {
    const a = await run(new SyncEvaluator(), 30);
    const b = await run(new ShuffledEvaluator(999), 30);
    expect(hashPopulation(b.ga)).toBe(hashPopulation(a.ga));
    expect(b.best).toEqual(a.best);
  });

  it("同じシードなら同一、違うシードなら別の集団になる", async () => {
    const a = await run(new SyncEvaluator(), 15, { seed: 7 });
    const b = await run(new SyncEvaluator(), 15, { seed: 7 });
    const c = await run(new SyncEvaluator(), 15, { seed: 8 });
    expect(hashPopulation(b.ga)).toBe(hashPopulation(a.ga));
    expect(hashPopulation(c.ga)).not.toBe(hashPopulation(a.ga));
  });

  it("エリート主義により best fitness が単調非減少", async () => {
    const { best } = await run(new SyncEvaluator(), 40);
    for (let i = 1; i < best.length; i++) {
      expect(best[i]).toBeGreaterThanOrEqual(best[i - 1] - 1e-9);
    }
  });

  it("50世代で初期世代より有意に改善する", async () => {
    const { best } = await run(new SyncEvaluator(), 50);
    expect(best[best.length - 1]).toBeGreaterThan(best[0] + 1);
  });

  it("変異を切ると子は必ず両親いずれかの遺伝子だけで構成される", async () => {
    const params: GaParams = {
      ...DEFAULT_GA_PARAMS,
      popSize: 20,
      eliteCount: 0,
      mutationBits: 0,
      structuralMutationRate: 0,
      immigrantRate: 0,
    };
    const ga = new Ga(W, H, params);
    const parents = ga.population.slice();
    const fitness = new Float64Array(params.popSize);
    for (let i = 0; i < params.popSize; i++) fitness[i] = i;
    ga.advance(fitness);

    const n = W * H;
    for (let i = 0; i < params.popSize; i++) {
      for (let k = 0; k < n; k++) {
        const v = ga.population[i * n + k];
        let found = false;
        for (let p = 0; p < params.popSize && !found; p++) {
          if (parents[p * n + k] === v) found = true;
        }
        expect(found).toBe(true);
      }
    }
  });

  it("注入したゲノムが次世代の集団に現れる", async () => {
    const params: GaParams = { ...DEFAULT_GA_PARAMS, popSize: 20 };
    const ga = new Ga(W, H, params);
    const mine = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) mine[5 * W + x] = 1;
    ga.inject(mine);
    expect(ga.pendingInjections).toBe(1);

    ga.advance(new Float64Array(params.popSize));
    expect(ga.pendingInjections).toBe(0);

    const n = W * H;
    let present = false;
    for (let i = 0; i < params.popSize && !present; i++) {
      let same = true;
      for (let k = 0; k < n; k++) {
        if (ga.population[i * n + k] !== mine[k]) {
          same = false;
          break;
        }
      }
      if (same) present = true;
    }
    expect(present).toBe(true);
  });
});

describe("Rng", () => {
  it("同じシードで同じ列を返す", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(new Rng(43).next()).not.toBe(new Rng(42).next());
  });
});

describe("Evaluator", () => {
  it("集団バッファと盤面サイズの食い違いを黙って通さない", async () => {
    // subarray は範囲をクランプして例外を投げないので、放置すると個体の境界を
    // またいだゴミを評価し続ける。UI側でサイズを取り違えた事故の再発防止。
    const ev = new SyncEvaluator();
    const popSize = 4;
    const pop = new Uint8Array(popSize * W * H);

    await expect(
      ev.evaluate(pop, popSize, W, H, DEFAULT_PATH_PARAMS, DEFAULT_FITNESS_PARAMS),
    ).resolves.toBeInstanceOf(Float64Array);

    // 同じバッファを別サイズの盤面として評価しようとしたら落ちること
    await expect(
      ev.evaluate(pop, popSize, W + 8, H, DEFAULT_PATH_PARAMS, DEFAULT_FITNESS_PARAMS),
    ).rejects.toThrow(/食い違っている/);
    await expect(
      ev.evaluate(pop, popSize + 1, W, H, DEFAULT_PATH_PARAMS, DEFAULT_FITNESS_PARAMS),
    ).rejects.toThrow(/食い違っている/);
  });
});
