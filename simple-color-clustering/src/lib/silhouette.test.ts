import { describe, it, expect } from "vitest";
import { silhouetteScore } from "./silhouette";
import { kmeans } from "./kmeans";

// 2つの明確に分離したクラスタ。
function twoBlobs(): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < 30; i++) pts.push([i * 0.1, 0, 0]);
  for (let i = 0; i < 30; i++) pts.push([100 + i * 0.1, 0, 0]);
  return pts;
}

describe("silhouetteScore", () => {
  it("分離した2クラスタを正しく分けるとスコアは高い (>0.8)", () => {
    const pts = twoBlobs();
    const { labels } = kmeans(pts, 2, { seed: 1 });
    const s = silhouetteScore(pts, labels, 2);
    expect(s).toBeGreaterThan(0.8);
  });

  it("適切な k(=2) は過分割 k(=3) よりスコアが高い", () => {
    const pts = twoBlobs();
    const s2 = silhouetteScore(pts, kmeans(pts, 2, { seed: 1 }).labels, 2);
    const s3 = silhouetteScore(pts, kmeans(pts, 3, { seed: 1 }).labels, 3);
    expect(s2).toBeGreaterThan(s3);
  });

  it("k<2 は 0 を返す", () => {
    const pts = twoBlobs();
    expect(silhouetteScore(pts, new Array(pts.length).fill(0), 1)).toBe(0);
  });
});
