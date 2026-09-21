// レーン別の探索結果 → 個体の適応度。
// 設計判断（なぜ travel を使うのか、なぜソフト減点なのか）は docs/ga-spec.md を参照。
import type { FitnessParams, GenomeStats, PathParams } from "./types.ts";
import { STATS_STRIDE } from "./types.ts";
import type { Pathfinder } from "./pathfinder.ts";

/** maxExpansions で探索が打ち切られたレーンのスコア。既定設定では到達しない。 */
export const UNREACHED_SCORE = -1e6;

/**
 * fitness = alpha*min(score) + (1-alpha)*mean(score) - wallCost*wallCount
 *   score_s = travel_s - breakPenalty * breaks_s
 *
 * travel（移動距離のみ）を使い、A* の g（ペナルティ込み）は使わない。
 * ペナルティは仮想コストであり、g を最大化すると「壁際を多く踏む」という
 * 実利のない設計に報酬が出てしまうため。
 */
export function computeFitness(
  laneTravel: ArrayLike<number>,
  laneBreaks: ArrayLike<number>,
  laneReached: ArrayLike<number>,
  laneCount: number,
  wallCount: number,
  p: FitnessParams,
): GenomeStats {
  let minScore = Infinity;
  let sum = 0;
  let totalBreaks = 0;

  for (let s = 0; s < laneCount; s++) {
    const score = laneReached[s]
      ? laneTravel[s] - p.breakPenalty * laneBreaks[s]
      : UNREACHED_SCORE;
    if (score < minScore) minScore = score;
    sum += score;
    totalBreaks += laneBreaks[s];
  }

  const meanScore = sum / laneCount;
  const fitness = p.alpha * minScore + (1 - p.alpha) * meanScore - p.wallCost * wallCount;
  return { fitness, minScore, meanScore, totalBreaks };
}

/** 壁タイル数。 */
export function countWalls(walls: Uint8Array, offset: number, n: number): number {
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (walls[offset + i]) c++;
  }
  return c;
}

/**
 * 集団のチャンクを評価して out に [fitness, minScore, meanScore, totalBreaks] を詰める。
 * worker と mainスレッド同期評価器の両方がこれを呼ぶ（＝両者は同一の純関数）。
 */
export function evaluateChunk(
  pf: Pathfinder,
  genomes: Uint8Array,
  count: number,
  path: PathParams,
  fit: FitnessParams,
  out: Float64Array,
): void {
  const n = pf.w * pf.h;
  for (let i = 0; i < count; i++) {
    const off = i * n;
    const walls = genomes.subarray(off, off + n);
    pf.solveAll(walls, path, false);
    const s = computeFitness(
      pf.laneTravel,
      pf.laneBreaks,
      pf.laneReached,
      pf.w,
      countWalls(genomes, off, n),
      fit,
    );
    const o = i * STATS_STRIDE;
    out[o] = s.fitness;
    out[o + 1] = s.minScore;
    out[o + 2] = s.meanScore;
    out[o + 3] = s.totalBreaks;
  }
}
