import { sampleNoise } from "./kernels.ts";
import type { FractalType, NoiseType } from "./types.ts";

export interface FractalParams {
  noiseType: NoiseType;
  fractalType: FractalType;
  seed: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  pingPongStrength: number;
}

// FastNoiseLite's normalization constant so total fractal amplitude stays
// bounded regardless of octave count (assumes weightedStrength = 0, the
// library's default).
function computeFractalBounding(octaves: number, gain: number): number {
  let amp = gain;
  let ampFractal = 1;
  for (let i = 1; i < octaves; i++) {
    ampFractal += amp;
    amp *= gain;
  }
  return 1 / ampFractal;
}

function pingPong(t: number): number {
  const wrapped = t - Math.floor(t / 4) * 4;
  return wrapped < 2 ? wrapped : 4 - wrapped;
}

// Multi-octave combination of the base noise kernel. Ported directly from
// FastNoiseLite's fractal loops (FBm / Ridged / Ping-Pong / None).
export function fractalNoise(
  x: number,
  y: number,
  z: number,
  p: FractalParams,
): number {
  let fx = x * p.frequency;
  let fy = y * p.frequency;
  let fz = z * p.frequency;

  if (p.fractalType === "none") {
    return sampleNoise(fx, fy, fz, p.seed, p.noiseType);
  }

  let amp = computeFractalBounding(p.octaves, p.gain);
  let sum = 0;

  switch (p.fractalType) {
    case "fbm":
      for (let i = 0; i < p.octaves; i++) {
        sum += sampleNoise(fx, fy, fz, p.seed + i, p.noiseType) * amp;
        fx *= p.lacunarity;
        fy *= p.lacunarity;
        fz *= p.lacunarity;
        amp *= p.gain;
      }
      break;
    case "ridged":
      for (let i = 0; i < p.octaves; i++) {
        const n = Math.abs(sampleNoise(fx, fy, fz, p.seed + i, p.noiseType));
        sum += (1 - 2 * n) * amp;
        fx *= p.lacunarity;
        fy *= p.lacunarity;
        fz *= p.lacunarity;
        amp *= p.gain;
      }
      break;
    case "pingPong":
      for (let i = 0; i < p.octaves; i++) {
        const n = sampleNoise(fx, fy, fz, p.seed + i, p.noiseType);
        const pp = pingPong((n + 1) * p.pingPongStrength);
        sum += (pp - 1) * amp;
        fx *= p.lacunarity;
        fy *= p.lacunarity;
        fz *= p.lacunarity;
        amp *= p.gain;
      }
      break;
  }

  return sum;
}
