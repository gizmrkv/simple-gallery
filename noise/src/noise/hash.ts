// Integer hash used by every noise kernel to turn a lattice coordinate
// (ix, iy, iz) plus a seed into a pseudo-random 32-bit value. Not the exact
// hash FastNoiseLite uses internally, but it is a decent avalanche mix
// (murmur-style) so different seeds produce visually distinct fields.
export function hash3D(seed: number, x: number, y: number, z: number): number {
  let h = seed | 0;
  h ^= Math.imul(x | 0, 0x27d4eb2f);
  h ^= Math.imul(y | 0, 0x165667b1);
  h ^= Math.imul(z | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return h | 0;
}

// Maps a hash to a float in roughly [-1, 1].
export function hashToSigned(h: number): number {
  return h / 2147483648;
}

// Maps a hash to a float in [0, 1).
export function hashToUnsigned(h: number): number {
  return (h >>> 0) / 4294967296;
}

// Quintic fade curve used to smooth interpolation weights (Perlin's
// "improved noise" curve): 6t^5 - 15t^4 + 10t^3.
export function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// Cubic Hermite interpolation between 4 consecutive samples (a,b,c,d), where
// b and c bracket the sample point and t in [0,1] is the fractional offset
// between them.
export function cubicLerp(
  a: number,
  b: number,
  c: number,
  d: number,
  t: number,
): number {
  const p = d - c - (a - b);
  return t * t * t * p + t * t * (a - b - p) + t * (c - a) + b;
}
