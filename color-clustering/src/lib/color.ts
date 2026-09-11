// sRGB(0-255) と CIELAB の相互変換。
// クラスタリングは知覚的に均等な LAB 空間で行い、結果は RGB / HEX で表示する。

export type Rgb = readonly [number, number, number]; // 各成分 0-255
export type Lab = readonly [number, number, number]; // L: 0-100, a/b: 概ね -128..127

// D65 基準白色点
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const cs = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, cs)) * 255);
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

export function rgbToLab([r, g, b]: Rgb): Lab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / XN;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / YN;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / ZN;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, b]: Lab): Rgb {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const x = labFInv(fx) * XN;
  const y = labFInv(fy) * YN;
  const z = labFInv(fz) * ZN;

  const rl = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const gl = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const bl = x * 0.0557 + y * -0.204 + z * 1.057;

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab));
}
