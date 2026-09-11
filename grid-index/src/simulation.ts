import { SpatialGrid, type Rect } from "./spatialGrid";

/**
 * N equal-radius circles bouncing elastically inside a rectangle, with
 * circle-circle collision detected either via a uniform spatial grid
 * (default) or brute-force all-pairs checking (for comparison).
 */
export class Simulation {
  static readonly RADIUS = 6.0;
  static readonly DIAMETER = 12.0;
  static readonly GRAVITY = 900.0;
  static readonly RESTITUTION = 0.8;

  bounds: Rect;
  paused = false;
  gravityEnabled = false;
  bruteForceEnabled = false;

  private n = 0;
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private collidingFlags = new Uint8Array(0);

  private speedValue = 120;
  private grid: SpatialGrid;

  private pairsI: number[] = [];
  private pairsJ: number[] = [];
  pairTestCount = 0;
  collideTimeMs = 0;

  constructor(width: number, height: number) {
    this.bounds = Simulation.computeBounds(width, height);
    this.grid = new SpatialGrid(this.bounds, Simulation.DIAMETER);
  }

  private static computeBounds(width: number, height: number): Rect {
    const r = Simulation.RADIUS;
    return {
      minX: r,
      minY: r,
      maxX: Math.max(r, width - r),
      maxY: Math.max(r, height - r),
    };
  }

  get count(): number {
    return this.n;
  }

  get speed(): number {
    return this.speedValue;
  }

  get contactCount(): number {
    return this.pairsI.length;
  }

  get positionsX(): Float32Array {
    return this.px;
  }

  get positionsY(): Float32Array {
    return this.py;
  }

  get colliding(): Uint8Array {
    return this.collidingFlags;
  }

  get spatialGrid(): SpatialGrid {
    return this.grid;
  }

  /** Full re-randomization of all `n` circles (used by the Reset button). */
  spawn(n: number): void {
    this.resizeArrays(n);
    for (let i = 0; i < n; i++) {
      this.randomizeCircle(i);
    }
  }

  /** Adds/removes circles to reach `n` without disturbing existing ones. */
  setCount(n: number): void {
    const previous = this.n;
    this.resizeArrays(n);
    for (let i = previous; i < n; i++) {
      this.randomizeCircle(i);
    }
  }

  private resizeArrays(n: number): void {
    const newPx = new Float32Array(n);
    const newPy = new Float32Array(n);
    const newVx = new Float32Array(n);
    const newVy = new Float32Array(n);
    const copyLen = Math.min(n, this.n);
    newPx.set(this.px.subarray(0, copyLen));
    newPy.set(this.py.subarray(0, copyLen));
    newVx.set(this.vx.subarray(0, copyLen));
    newVy.set(this.vy.subarray(0, copyLen));

    this.px = newPx;
    this.py = newPy;
    this.vx = newVx;
    this.vy = newVy;
    this.collidingFlags = new Uint8Array(n);
    this.n = n;
  }

  private randomizeCircle(i: number): void {
    const { minX, minY, maxX, maxY } = this.bounds;
    this.px[i] = minX + Math.random() * Math.max(0, maxX - minX);
    this.py[i] = minY + Math.random() * Math.max(0, maxY - minY);
    const angle = Math.random() * Math.PI * 2;
    this.vx[i] = Math.cos(angle) * this.speedValue;
    this.vy[i] = Math.sin(angle) * this.speedValue;
  }

  /** Sets the uniform target speed and rescales every velocity to match it. */
  setSpeed(value: number): void {
    this.speedValue = value;
    for (let i = 0; i < this.n; i++) {
      this.renormalizeVelocity(i, value);
    }
  }

  private renormalizeVelocity(i: number, speed: number): void {
    const vx = this.vx[i];
    const vy = this.vy[i];
    const len = Math.hypot(vx, vy);
    if (len > 1e-9) {
      const scale = speed / len;
      this.vx[i] = vx * scale;
      this.vy[i] = vy * scale;
    } else {
      this.vx[i] = speed;
      this.vy[i] = 0;
    }
  }

  setGravity(enabled: boolean): void {
    this.gravityEnabled = enabled;
    if (!enabled) {
      // Snap every circle back to a uniform speed (gravity lets speeds diverge).
      this.setSpeed(this.speedValue);
    }
  }

  /** Recomputes the movement bounds/grid for a new canvas size and clamps circles into it. */
  setBounds(width: number, height: number): void {
    this.bounds = Simulation.computeBounds(width, height);
    this.grid.configure(this.bounds, Simulation.DIAMETER);
    const { minX, minY, maxX, maxY } = this.bounds;
    for (let i = 0; i < this.n; i++) {
      if (this.px[i] < minX) this.px[i] = minX;
      else if (this.px[i] > maxX) this.px[i] = maxX;
      if (this.py[i] < minY) this.py[i] = minY;
      else if (this.py[i] > maxY) this.py[i] = maxY;
    }
  }

  step(dt: number): void {
    if (this.paused) return;
    this.integrate(dt);
    this.detectAndResolveCollisions();
  }

  /** Rebuilds the grid from current positions, e.g. for overlay display when
   * brute-force mode skipped the grid this frame. */
  buildGridForVisualization(): void {
    this.grid.build(this.px, this.py, this.n);
  }

  private integrate(dt: number): void {
    const { minX, minY, maxX, maxY } = this.bounds;
    const e = this.gravityEnabled ? Simulation.RESTITUTION : 1.0;
    const gravity = this.gravityEnabled ? Simulation.GRAVITY : 0;

    for (let i = 0; i < this.n; i++) {
      if (gravity) this.vy[i] += gravity * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;

      if (this.px[i] < minX) {
        this.px[i] = minX;
        this.vx[i] = -this.vx[i] * e;
      } else if (this.px[i] > maxX) {
        this.px[i] = maxX;
        this.vx[i] = -this.vx[i] * e;
      }
      if (this.py[i] < minY) {
        this.py[i] = minY;
        this.vy[i] = -this.vy[i] * e;
      } else if (this.py[i] > maxY) {
        this.py[i] = maxY;
        this.vy[i] = -this.vy[i] * e;
      }
    }
  }

  private detectAndResolveCollisions(): void {
    this.collidingFlags.fill(0);
    this.pairsI.length = 0;
    this.pairsJ.length = 0;

    const start = performance.now();
    if (this.bruteForceEnabled) {
      this.pairTestCount = this.bruteForcePairs();
    } else {
      this.grid.build(this.px, this.py, this.n);
      this.pairTestCount = this.grid.getCollisionPairs(
        this.px,
        this.py,
        this.n,
        Simulation.DIAMETER,
        this.pairsI,
        this.pairsJ,
      );
    }
    this.collideTimeMs = performance.now() - start;

    const e = this.gravityEnabled ? Simulation.RESTITUTION : 1.0;
    for (let k = 0; k < this.pairsI.length; k++) {
      const i = this.pairsI[k];
      const j = this.pairsJ[k];
      this.collidingFlags[i] = 1;
      this.collidingFlags[j] = 1;
      this.resolvePair(i, j, e);
    }

    if (!this.gravityEnabled) {
      // Collisions can nudge speeds apart; snap the affected circles back
      // to the uniform speed so the whole population stays constant-speed.
      for (let i = 0; i < this.n; i++) {
        if (this.collidingFlags[i]) this.renormalizeVelocity(i, this.speedValue);
      }
    }
  }

  private bruteForcePairs(): number {
    const n = this.n;
    const minDistSq = Simulation.DIAMETER * Simulation.DIAMETER;
    let testCount = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        testCount++;
        const dx = this.px[j] - this.px[i];
        const dy = this.py[j] - this.py[i];
        if (dx * dx + dy * dy < minDistSq) {
          this.pairsI.push(i);
          this.pairsJ.push(j);
        }
      }
    }
    return testCount;
  }

  private resolvePair(i: number, j: number, e: number): void {
    const dx = this.px[j] - this.px[i];
    const dy = this.py[j] - this.py[i];
    const dist = Math.hypot(dx, dy);
    let nx: number;
    let ny: number;
    if (dist > 1e-9) {
      nx = dx / dist;
      ny = dy / dist;
    } else {
      nx = 1;
      ny = 0;
    }

    const overlap = Simulation.DIAMETER - dist;
    if (overlap > 0) {
      const push = overlap * 0.5;
      this.px[i] -= nx * push;
      this.py[i] -= ny * push;
      this.px[j] += nx * push;
      this.py[j] += ny * push;
    }

    const relNormal = (this.vx[j] - this.vx[i]) * nx + (this.vy[j] - this.vy[i]) * ny;
    if (relNormal < 0) {
      const impulseMag = (relNormal * (1 + e)) / 2;
      const ix = nx * impulseMag;
      const iy = ny * impulseMag;
      this.vx[i] += ix;
      this.vy[i] += iy;
      this.vx[j] -= ix;
      this.vy[j] -= iy;
    }
  }
}
