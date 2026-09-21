import { describe, it, expect } from "vitest";
import { computeFitness, countWalls, UNREACHED_SCORE } from "./fitness.ts";
import type { FitnessParams } from "./types.ts";

const p: FitnessParams = { alpha: 0.5, breakPenalty: 30, wallCost: 0.1 };

describe("computeFitness", () => {
  it("score_s = travel - breakPenalty*breaks を min/mean でブレンドする", () => {
    // score = [40, 20-30= -10, 30]  → min=-10, mean=20
    const stats = computeFitness([40, 20, 30], [0, 1, 0], [1, 1, 1], 3, 50, p);
    expect(stats.minScore).toBeCloseTo(-10, 9);
    expect(stats.meanScore).toBeCloseTo(20, 9);
    // 0.5*(-10) + 0.5*20 - 0.1*50 = -5 + 10 - 5 = 0
    expect(stats.fitness).toBeCloseTo(0, 9);
    expect(stats.totalBreaks).toBe(1);
  });

  it("alpha=1 は純maximin、alpha=0 は純平均", () => {
    const t = [40, 20, 30];
    const b = [0, 0, 0];
    const r = [1, 1, 1];
    const onlyMin = computeFitness(t, b, r, 3, 0, { ...p, alpha: 1 });
    expect(onlyMin.fitness).toBeCloseTo(20, 9);
    const onlyMean = computeFitness(t, b, r, 3, 0, { ...p, alpha: 0 });
    expect(onlyMean.fitness).toBeCloseTo(30, 9);
  });

  it("breakPenalty=0 なら破壊は無視され純 travel 最適になる", () => {
    const stats = computeFitness([40, 20, 30], [0, 5, 2], [1, 1, 1], 3, 0, {
      ...p,
      breakPenalty: 0,
    });
    expect(stats.minScore).toBeCloseTo(20, 9);
    expect(stats.totalBreaks).toBe(7);
  });

  it("wallCost は壁の枚数に比例して引かれる", () => {
    const a = computeFitness([30, 30], [0, 0], [1, 1], 2, 0, p);
    const b = computeFitness([30, 30], [0, 0], [1, 1], 2, 100, p);
    expect(a.fitness - b.fitness).toBeCloseTo(10, 9);
  });

  it("未到達レーンは大きな負スコアになる", () => {
    const stats = computeFitness([30, 0], [0, 0], [1, 0], 2, 0, p);
    expect(stats.minScore).toBe(UNREACHED_SCORE);
  });
});

describe("countWalls", () => {
  it("オフセット付きで数える", () => {
    const buf = new Uint8Array([1, 0, 1, 1, /* ここから */ 0, 1, 1, 0]);
    expect(countWalls(buf, 0, 4)).toBe(3);
    expect(countWalls(buf, 4, 4)).toBe(2);
  });
});
