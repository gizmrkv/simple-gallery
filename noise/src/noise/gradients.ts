// The 12 classic gradient directions used by Perlin/Simplex noise: every
// permutation of (±1, ±1, 0), (±1, 0, ±1), (0, ±1, ±1) — i.e. the midpoints
// of a cube's edges.
export const GRAD3: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
