export type ColorPreset = "grayscale" | "heat" | "ocean" | "forest";

export const COLOR_PRESET_OPTIONS: { value: ColorPreset; label: string }[] = [
  { value: "grayscale", label: "Grayscale" },
  { value: "heat", label: "Heat" },
  { value: "ocean", label: "Ocean" },
  { value: "forest", label: "Forest" },
];

type Stop = { offset: number; rgb: [number, number, number] };

const GRADIENTS: Record<ColorPreset, Stop[]> = {
  grayscale: [
    { offset: 0, rgb: [0, 0, 0] },
    { offset: 1, rgb: [1, 1, 1] },
  ],
  heat: [
    { offset: 0, rgb: [0, 0, 0] },
    { offset: 0.25, rgb: [0.5, 0, 0] },
    { offset: 0.5, rgb: [1, 0.3, 0] },
    { offset: 0.75, rgb: [1, 0.8, 0] },
    { offset: 1, rgb: [1, 1, 1] },
  ],
  ocean: [
    { offset: 0, rgb: [0, 0.02, 0.15] },
    { offset: 0.25, rgb: [0, 0.18, 0.42] },
    { offset: 0.5, rgb: [0, 0.55, 0.65] },
    { offset: 0.75, rgb: [0.5, 0.9, 0.95] },
    { offset: 1, rgb: [1, 1, 1] },
  ],
  forest: [
    { offset: 0, rgb: [0.12, 0.07, 0.02] },
    { offset: 0.25, rgb: [0.07, 0.22, 0.05] },
    { offset: 0.5, rgb: [0.15, 0.45, 0.1] },
    { offset: 0.75, rgb: [0.45, 0.72, 0.2] },
    { offset: 1, rgb: [0.78, 0.88, 0.55] },
  ],
};

// Builds a 256-entry RGB lookup table (values 0..255) by linearly
// interpolating between the preset's gradient stops.
export function buildLut(preset: ColorPreset): Uint8ClampedArray {
  const stops = GRADIENTS[preset];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
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
    lut[i * 3] = (a.rgb[0] + (b.rgb[0] - a.rgb[0]) * localT) * 255;
    lut[i * 3 + 1] = (a.rgb[1] + (b.rgb[1] - a.rgb[1]) * localT) * 255;
    lut[i * 3 + 2] = (a.rgb[2] + (b.rgb[2] - a.rgb[2]) * localT) * 255;
  }
  return lut;
}
