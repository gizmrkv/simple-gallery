// カラーグラデーションの定義とLUT(ルックアップテーブル)生成。

export const LUT_SIZE = 256;

export interface GradientStop {
  offset: number;
  r: number;
  g: number;
  b: number;
}

export interface Gradient {
  name: string;
  stops: GradientStop[];
}

export const GRADIENTS: Gradient[] = [
  {
    name: "Grayscale",
    stops: [
      { offset: 0.0, r: 0, g: 0, b: 0 },
      { offset: 1.0, r: 1, g: 1, b: 1 },
    ],
  },
  {
    name: "Heat",
    stops: [
      { offset: 0.0, r: 0, g: 0, b: 0 },
      { offset: 0.25, r: 0.5, g: 0, b: 0 },
      { offset: 0.5, r: 1, g: 0.3, b: 0 },
      { offset: 0.75, r: 1, g: 0.8, b: 0 },
      { offset: 1.0, r: 1, g: 1, b: 1 },
    ],
  },
  {
    name: "Ocean",
    stops: [
      { offset: 0.0, r: 0, g: 0.02, b: 0.15 },
      { offset: 0.25, r: 0, g: 0.18, b: 0.42 },
      { offset: 0.5, r: 0, g: 0.55, b: 0.65 },
      { offset: 0.75, r: 0.5, g: 0.9, b: 0.95 },
      { offset: 1.0, r: 1, g: 1, b: 1 },
    ],
  },
  {
    name: "Forest",
    stops: [
      { offset: 0.0, r: 0.12, g: 0.07, b: 0.02 },
      { offset: 0.25, r: 0.07, g: 0.22, b: 0.05 },
      { offset: 0.5, r: 0.15, g: 0.45, b: 0.1 },
      { offset: 0.75, r: 0.45, g: 0.72, b: 0.2 },
      { offset: 1.0, r: 0.78, g: 0.88, b: 0.55 },
    ],
  },
  {
    name: "Spectrum",
    stops: [
      { offset: 0.0, r: 0, g: 0, b: 0.1 },
      { offset: 0.25, r: 0.2, g: 0, b: 0.5 },
      { offset: 0.5, r: 0.9, g: 0.1, b: 0.4 },
      { offset: 0.75, r: 1, g: 0.6, b: 0 },
      { offset: 1.0, r: 1, g: 1, b: 0.7 },
    ],
  },
];

export const DEFAULT_GRADIENT_INDEX = 1; // Heat

// グラデーションの各ストップ間を線形補間し、256エントリのRGB LUT(0..255)を作る。
export function buildLut(gradient: Gradient): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 3);
  const stops = gradient.stops;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);

    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].offset && t <= stops[s + 1].offset) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }

    const span = b.offset - a.offset;
    const localT = span > 0 ? (t - a.offset) / span : 0;

    lut[i * 3 + 0] = (a.r + (b.r - a.r) * localT) * 255;
    lut[i * 3 + 1] = (a.g + (b.g - a.g) * localT) * 255;
    lut[i * 3 + 2] = (a.b + (b.b - a.b) * localT) * 255;
  }
  return lut;
}
