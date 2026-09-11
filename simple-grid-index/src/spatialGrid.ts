/** Axis-aligned rectangle used both as the circle movement bounds and the grid extent. */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Uniform spatial grid used as a broad-phase for circle-circle collision
 * detection. Rebuilt every frame with a two-pass counting sort so that all
 * circles in a cell end up contiguous inside a single flat `items` array
 * (no per-cell allocation).
 */
export class SpatialGrid {
  private bounds: Rect;
  private cellSize: number;
  cols = 1;
  rows = 1;

  private counts = new Int32Array(1);
  private starts = new Int32Array(2);
  private cellOf = new Int32Array(0);
  private items = new Int32Array(0);

  constructor(bounds: Rect, cellSize: number) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.configure(bounds, cellSize);
  }

  /** Recomputes grid dimensions for a new bounds/cell size. */
  configure(bounds: Rect, cellSize: number): void {
    this.bounds = bounds;
    this.cellSize = cellSize;
    const width = Math.max(0, bounds.maxX - bounds.minX);
    const height = Math.max(0, bounds.maxY - bounds.minY);
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.counts = new Int32Array(this.cols * this.rows);
    this.starts = new Int32Array(this.cols * this.rows + 1);
  }

  get cellSizePx(): number {
    return this.cellSize;
  }

  get originX(): number {
    return this.bounds.minX;
  }

  get originY(): number {
    return this.bounds.minY;
  }

  /** Number of circles currently bucketed in the given cell (after `build`). */
  occupancyAt(cellIndex: number): number {
    return this.counts[cellIndex];
  }

  /** Two-pass counting sort: bucket every circle into its grid cell. */
  build(px: Float32Array, py: Float32Array, n: number): void {
    if (this.cellOf.length !== n) {
      this.cellOf = new Int32Array(n);
      this.items = new Int32Array(n);
    }
    this.counts.fill(0);

    const { minX, minY } = this.bounds;
    const cellSize = this.cellSize;
    const cols = this.cols;
    const rows = this.rows;

    // Pass 1: assign each circle to a cell and count occupants per cell.
    for (let i = 0; i < n; i++) {
      let cx = Math.floor((px[i] - minX) / cellSize);
      let cy = Math.floor((py[i] - minY) / cellSize);
      if (cx < 0) cx = 0;
      else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0;
      else if (cy >= rows) cy = rows - 1;

      const cell = cy * cols + cx;
      this.cellOf[i] = cell;
      this.counts[cell]++;
    }

    // Prefix sum: starts[c] is where cell c's circles begin in `items`.
    const cellCount = cols * rows;
    this.starts[0] = 0;
    for (let c = 0; c < cellCount; c++) {
      this.starts[c + 1] = this.starts[c] + this.counts[c];
    }

    // Pass 2: scatter circle indices into their cell's slice of `items`.
    const cursor = this.starts.slice(0, cellCount);
    for (let i = 0; i < n; i++) {
      const cell = this.cellOf[i];
      this.items[cursor[cell]++] = i;
    }
  }

  /**
   * Finds all pairs (i, j) with i < j whose circles are closer than
   * `minDist`, checking only the 3x3 neighborhood of cells around each
   * circle. Appends pairs to `outI`/`outJ` and returns the number of
   * distance tests performed.
   */
  getCollisionPairs(
    px: Float32Array,
    py: Float32Array,
    n: number,
    minDist: number,
    outI: number[],
    outJ: number[],
  ): number {
    let testCount = 0;
    const minDistSq = minDist * minDist;
    const cols = this.cols;
    const rows = this.rows;

    for (let i = 0; i < n; i++) {
      const cell = this.cellOf[i];
      const cx = cell % cols;
      const cy = (cell / cols) | 0;

      const gx0 = Math.max(0, cx - 1);
      const gx1 = Math.min(cols - 1, cx + 1);
      const gy0 = Math.max(0, cy - 1);
      const gy1 = Math.min(rows - 1, cy + 1);

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const c = gy * cols + gx;
          const start = this.starts[c];
          const end = this.starts[c + 1];
          for (let k = start; k < end; k++) {
            const j = this.items[k];
            if (j <= i) continue;
            testCount++;
            const dx = px[j] - px[i];
            const dy = py[j] - py[i];
            if (dx * dx + dy * dy < minDistSq) {
              outI.push(i);
              outJ.push(j);
            }
          }
        }
      }
    }

    return testCount;
  }
}
