import { describe, it, expect } from "vitest";
import { clusterImage, type ImageLike } from "./clusterImage";

// width×height の画像を、色の配列を縦に等分割して塗って生成する。
function makeImage(width: number, height: number, colors: [number, number, number][]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const band = Math.min(colors.length - 1, Math.floor((y / height) * colors.length));
    const [r, g, b] = colors[band];
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("clusterImage", () => {
  it("3色の画像で bestK=3 を選び、各色を抽出する", () => {
    const img = makeImage(40, 60, [
      [220, 30, 30],
      [30, 200, 60],
      [40, 60, 220],
    ]);
    const result = clusterImage(img, { seed: 3 });
    expect(result.bestK).toBe(3);

    const best = result.perK.find((r) => r.k === 3)!;
    expect(best.swatches).toHaveLength(3);
    // 3バンドが概ね均等 → 各 weight は 1/3 付近
    for (const s of best.swatches) {
      expect(s.weight).toBeGreaterThan(0.2);
      expect(s.weight).toBeLessThan(0.45);
    }
    // 抽出色が赤・緑・青に対応する（各チャンネルが支配的な色が1つずつある）
    const dominant = (idx: number) => best.swatches.some((s) => s.rgb[idx] > 150 && s.rgb[(idx + 1) % 3] < 120 && s.rgb[(idx + 2) % 3] < 120);
    expect(dominant(0)).toBe(true); // 赤
    expect(dominant(1)).toBe(true); // 緑
    expect(dominant(2)).toBe(true); // 青
  });

  it("全 k の結果を保持する（手動上書き用）", () => {
    const img = makeImage(20, 20, [
      [10, 10, 10],
      [240, 240, 240],
    ]);
    const result = clusterImage(img, { kMin: 2, kMax: 5, seed: 1 });
    expect(result.perK.map((r) => r.k)).toEqual([2, 3, 4, 5]);
  });

  it("完全に透明な画像はエラーになる", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4); // alpha 全て 0
    expect(() => clusterImage({ data, width: 10, height: 10 })).toThrow();
  });
});
