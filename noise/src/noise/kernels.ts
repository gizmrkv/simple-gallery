import { cubicLerp, fade, hash3D, hashToSigned, hashToUnsigned, lerp } from "./hash.ts";
import { GRAD3 } from "./gradients.ts";
import type { NoiseType } from "./types.ts";

function valueAt(ix: number, iy: number, iz: number, seed: number): number {
  return hashToSigned(hash3D(seed, ix, iy, iz));
}

function gradIndexAt(ix: number, iy: number, iz: number, seed: number): number {
  return (hash3D(seed, ix, iy, iz) >>> 0) % 12;
}

// 1. Value noise: trilinear interpolation of hashed lattice corners.
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);

  const c000 = valueAt(ix, iy, iz, seed);
  const c100 = valueAt(ix + 1, iy, iz, seed);
  const c010 = valueAt(ix, iy + 1, iz, seed);
  const c110 = valueAt(ix + 1, iy + 1, iz, seed);
  const c001 = valueAt(ix, iy, iz + 1, seed);
  const c101 = valueAt(ix + 1, iy, iz + 1, seed);
  const c011 = valueAt(ix, iy + 1, iz + 1, seed);
  const c111 = valueAt(ix + 1, iy + 1, iz + 1, seed);

  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w);
}

// Empirically chosen so the tricubic result lands roughly in [-1, 1]
// (see port calibration notes; raw cubicLerp output has std ~0.5).
const CUBIC_SCALE = 0.6;
const cubicRowX = new Float64Array(4);
const cubicRowY = new Float64Array(4);

// 2. Value Cubic noise: tricubic interpolation over the 4x4x4 neighborhood.
function valueCubicNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  for (let dz = -1; dz <= 2; dz++) {
    for (let dy = -1; dy <= 2; dy++) {
      const a = valueAt(ix - 1, iy + dy, iz + dz, seed);
      const b = valueAt(ix, iy + dy, iz + dz, seed);
      const c = valueAt(ix + 1, iy + dy, iz + dz, seed);
      const d = valueAt(ix + 2, iy + dy, iz + dz, seed);
      cubicRowX[dy + 1] = cubicLerp(a, b, c, d, fx);
    }
    cubicRowY[dz + 1] = cubicLerp(
      cubicRowX[0],
      cubicRowX[1],
      cubicRowX[2],
      cubicRowX[3],
      fy,
    );
  }
  const result = cubicLerp(cubicRowY[0], cubicRowY[1], cubicRowY[2], cubicRowY[3], fz);
  return result * CUBIC_SCALE;
}

function dotGrad(
  ix: number,
  iy: number,
  iz: number,
  seed: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const g = GRAD3[gradIndexAt(ix, iy, iz, seed)];
  return g[0] * dx + g[1] * dy + g[2] * dz;
}

// 3. Perlin noise: trilinear blend of gradient dot products at the 8 lattice
// corners (classic/"improved" Perlin noise, minus the exact permutation table).
function perlinNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);

  const n000 = dotGrad(ix, iy, iz, seed, fx, fy, fz);
  const n100 = dotGrad(ix + 1, iy, iz, seed, fx - 1, fy, fz);
  const n010 = dotGrad(ix, iy + 1, iz, seed, fx, fy - 1, fz);
  const n110 = dotGrad(ix + 1, iy + 1, iz, seed, fx - 1, fy - 1, fz);
  const n001 = dotGrad(ix, iy, iz + 1, seed, fx, fy, fz - 1);
  const n101 = dotGrad(ix + 1, iy, iz + 1, seed, fx - 1, fy, fz - 1);
  const n011 = dotGrad(ix, iy + 1, iz + 1, seed, fx, fy - 1, fz - 1);
  const n111 = dotGrad(ix + 1, iy + 1, iz + 1, seed, fx - 1, fy - 1, fz - 1);

  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w);
}

// Classic 3D simplex noise (Perlin/Gustavson formulation). `falloff` and
// `scale` are the two knobs used to derive the "Simplex Smooth" variant
// below from the same code path.
const F3 = 1 / 3;
const G3 = 1 / 6;
function simplexNoise(
  x: number,
  y: number,
  z: number,
  seed: number,
  falloff: number,
  scale: number,
): number {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const gi0 = GRAD3[gradIndexAt(i, j, k, seed)];
  const gi1 = GRAD3[gradIndexAt(i + i1, j + j1, k + k1, seed)];
  const gi2 = GRAD3[gradIndexAt(i + i2, j + j2, k + k2, seed)];
  const gi3 = GRAD3[gradIndexAt(i + 1, j + 1, k + 1, seed)];

  let n0 = 0;
  let t0 = falloff - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) {
    t0 *= t0;
    n0 = t0 * t0 * (gi0[0] * x0 + gi0[1] * y0 + gi0[2] * z0);
  }
  let n1 = 0;
  let t1 = falloff - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) {
    t1 *= t1;
    n1 = t1 * t1 * (gi1[0] * x1 + gi1[1] * y1 + gi1[2] * z1);
  }
  let n2 = 0;
  let t2 = falloff - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) {
    t2 *= t2;
    n2 = t2 * t2 * (gi2[0] * x2 + gi2[1] * y2 + gi2[2] * z2);
  }
  let n3 = 0;
  let t3 = falloff - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) {
    t3 *= t3;
    n3 = t3 * t3 * (gi3[0] * x3 + gi3[1] * y3 + gi3[2] * z3);
  }

  return scale * (n0 + n1 + n2 + n3);
}

// 6. Cellular (Worley) noise: F1 distance to the nearest jittered feature
// point among the 3x3x3 block of neighboring cells.
function cellularNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let minDist = Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        // Three independent hashes give the per-cell jitter offset.
        const jx = hashToUnsigned(hash3D(seed, cx, cy, cz));
        const jy = hashToUnsigned(hash3D(seed ^ 0x5bd1e995, cx, cy, cz));
        const jz = hashToUnsigned(hash3D(seed ^ 0x27d4eb2f, cx, cy, cz));
        const ddx = cx + jx - x;
        const ddy = cy + jy - y;
        const ddz = cz + jz - z;
        const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (d < minDist) minDist = d;
      }
    }
  }
  // Normalize F1 (mean ~0.5 for a jittered unit grid) into roughly [-1, 1].
  const v = minDist * 2 - 1;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

// Empirically chosen so plain Simplex and Simplex Smooth have comparable
// amplitude despite the wider falloff radius (see port calibration notes).
const SIMPLEX_FALLOFF = 0.6;
const SIMPLEX_SCALE = 32;
const SIMPLEX_SMOOTH_FALLOFF = 0.75;
const SIMPLEX_SMOOTH_SCALE = 10;

// Single-octave noise sample in roughly [-1, 1] for the given noise type.
export function sampleNoise(
  x: number,
  y: number,
  z: number,
  seed: number,
  type: NoiseType,
): number {
  switch (type) {
    case "value":
      return valueNoise(x, y, z, seed);
    case "valueCubic":
      return valueCubicNoise(x, y, z, seed);
    case "perlin":
      return perlinNoise(x, y, z, seed);
    case "simplex":
      return simplexNoise(x, y, z, seed, SIMPLEX_FALLOFF, SIMPLEX_SCALE);
    case "simplexSmooth":
      return simplexNoise(x, y, z, seed, SIMPLEX_SMOOTH_FALLOFF, SIMPLEX_SMOOTH_SCALE);
    case "cellular":
      return cellularNoise(x, y, z, seed);
  }
}
