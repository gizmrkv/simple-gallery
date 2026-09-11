export type NoiseType =
  | "simplexSmooth"
  | "simplex"
  | "cellular"
  | "perlin"
  | "valueCubic"
  | "value";

export const NOISE_TYPE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: "simplexSmooth", label: "Simplex Smooth" },
  { value: "simplex", label: "Simplex" },
  { value: "cellular", label: "Cellular" },
  { value: "perlin", label: "Perlin" },
  { value: "valueCubic", label: "Value Cubic" },
  { value: "value", label: "Value" },
];

export type FractalType = "fbm" | "ridged" | "pingPong" | "none";

export const FRACTAL_TYPE_OPTIONS: { value: FractalType; label: string }[] = [
  { value: "fbm", label: "FBm" },
  { value: "ridged", label: "Ridged" },
  { value: "pingPong", label: "Ping-Pong" },
  { value: "none", label: "None" },
];
