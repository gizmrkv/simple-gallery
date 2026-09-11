import { describe, it, expect } from "vitest";
import { kmeans } from "./kmeans";

// 3つの明確に分離したガウシアン的クラスタを合成する。
function makeBlobs(): number[][] {
  const centers = [
    [0, 0, 0],
    [50, 50, 50],
    [0, 80, 0],
  ];
  const pts: number[][] = [];
  // 決定的なジッタ（seed 不要）
  let s = 12345;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff - 0.5) * 6; // ±3 の範囲
  };
  for (const c of centers) {
    for (let i = 0; i < 40; i++) {
      pts.push([c[0] + rand(), c[1] + rand(), c[2] + rand()]);
    }
  }
  return pts;
}

describe("kmeans", () => {
  it("3つの分離したクラスタを正しく分割する", () => {
    const pts = makeBlobs();
    const res = kmeans(pts, 3, { seed: 7 });

    expect(res.centroids).toHaveLength(3);
    // 各クラスタは概ね 40 点（完全分離なので均等になるはず）
    expect(res.sizes.every((s) => s >= 30 && s <= 50)).toBe(true);

    // 同じブロブの点同士は同じラベルになる（最初の40点は全部同じ）
    const firstLabel = res.labels[0];
    for (let i = 1; i < 40; i++) {
      expect(res.labels[i]).toBe(firstLabel);
    }
  });

  it("k を増やすと inertia は単調に減少する", () => {
    const pts = makeBlobs();
    const i2 = kmeans(pts, 2, { seed: 1 }).inertia;
    const i3 = kmeans(pts, 3, { seed: 1 }).inertia;
    const i4 = kmeans(pts, 4, { seed: 1 }).inertia;
    expect(i3).toBeLessThan(i2);
    expect(i4).toBeLessThanOrEqual(i3 + 1e-6);
  });

  it("同一シードで再現性がある", () => {
    const pts = makeBlobs();
    const a = kmeans(pts, 3, { seed: 42 });
    const b = kmeans(pts, 3, { seed: 42 });
    expect(a.inertia).toBeCloseTo(b.inertia, 9);
  });

  it("k が点数を超えても破綻しない", () => {
    const pts = [
      [0, 0, 0],
      [10, 10, 10],
    ];
    const res = kmeans(pts, 5, { seed: 1 });
    expect(res.centroids.length).toBeLessThanOrEqual(2);
  });
});
