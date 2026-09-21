// シード付き PRNG。GA の再現性はこれ1つに依存する。
// mulberry32（color-clustering/src/lib/clusterImage.ts と同じもの）。

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0,n) の整数 */
  int(n: number): number {
    return (this.next() * n) | 0;
  }

  /** [lo,hi] の整数 */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  bool(p: number): boolean {
    return this.next() < p;
  }
}
