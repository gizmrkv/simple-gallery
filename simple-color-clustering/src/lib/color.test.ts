import { describe, it, expect } from "vitest";
import { rgbToLab, labToRgb, rgbToHex, type Rgb } from "./color";

describe("rgbToLab", () => {
  it("白は L=100, a=b=0 付近", () => {
    const [l, a, b] = rgbToLab([255, 255, 255]);
    expect(l).toBeCloseTo(100, 1);
    expect(a).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it("黒は L=0, a=b=0", () => {
    const [l, a, b] = rgbToLab([0, 0, 0]);
    expect(l).toBeCloseTo(0, 4);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });

  it("赤の既知参照値に一致する (L≈53.24, a≈80.09, b≈67.20)", () => {
    const [l, a, b] = rgbToLab([255, 0, 0]);
    expect(l).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });
});

describe("往復変換 rgb -> lab -> rgb", () => {
  const samples: Rgb[] = [
    [255, 255, 255],
    [0, 0, 0],
    [255, 0, 0],
    [18, 52, 86],
    [123, 200, 47],
    [200, 100, 150],
  ];
  it("元の RGB を ±1 以内で復元する", () => {
    for (const rgb of samples) {
      const back = labToRgb(rgbToLab(rgb));
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(back[i] - rgb[i])).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("rgbToHex", () => {
  it("各成分を 2 桁 16 進にする", () => {
    expect(rgbToHex([18, 52, 86])).toBe("#123456");
    expect(rgbToHex([0, 0, 0])).toBe("#000000");
    expect(rgbToHex([255, 255, 255])).toBe("#ffffff");
  });
});
