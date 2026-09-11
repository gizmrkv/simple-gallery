// Gray-Scott反応拡散シミュレーション本体。
// u, v の2つの化学濃度場をトーラス状(ラップアラウンド)のグリッド上で更新する。

export interface GrayScottParams {
  feed: number;
  kill: number;
  du: number;
  dv: number;
  dt: number;
  stepsPerFrame: number;
  brushSize: number;
}

export class GrayScott {
  resolution: number;
  u: Float32Array;
  v: Float32Array;
  private u2: Float32Array;
  private v2: Float32Array;

  params: GrayScottParams;

  constructor(resolution: number, params: GrayScottParams) {
    this.resolution = resolution;
    this.params = params;
    const n = resolution * resolution;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    this.reset();
  }

  // グリッド解像度を変更してバッファを作り直し、初期状態にリセットする。
  setResolution(resolution: number): void {
    this.resolution = resolution;
    const n = resolution * resolution;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    this.reset();
  }

  // u=1, v=0 で全面を初期化し、中央に種を1つ置く。
  reset(): void {
    this.u.fill(1);
    this.v.fill(0);
    const res = this.resolution;
    const radius = Math.max(4, Math.floor(res / 12));
    this.stampCircle(Math.floor(res / 2), Math.floor(res / 2), radius, true);
  }

  // ランダムな位置に複数の種をばら撒く。
  randomReseed(): void {
    this.u.fill(1);
    this.v.fill(0);
    const res = this.resolution;
    for (let i = 0; i < 24; i++) {
      const cx = Math.floor(Math.random() * res);
      const cy = Math.floor(Math.random() * res);
      const radius = 4 + Math.floor(Math.random() * 6);
      this.stampCircle(cx, cy, radius, true);
    }
  }

  // (cx, cy)を中心とした円盤状の領域に種を撒く(seed=true)か消去する(seed=false)。
  // グリッド端ではクランプする(ラップしない)。
  stampCircle(cx: number, cy: number, radius: number, seed: boolean): void {
    const res = this.resolution;
    const uVal = seed ? 0.5 : 1.0;
    const vVal = seed ? 0.25 : 0.0;
    const r2 = radius * radius;
    const minX = Math.max(0, cx - radius);
    const maxX = Math.min(res - 1, cx + radius);
    const minY = Math.max(0, cy - radius);
    const maxY = Math.min(res - 1, cy + radius);
    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      const rowOffset = y * res;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          const idx = rowOffset + x;
          this.u[idx] = uVal;
          this.v[idx] = vVal;
        }
      }
    }
  }

  // stepsPerFrame回分、シミュレーションを1回だけ進める(Stepボタン用)。
  stepOnce(): void {
    for (let i = 0; i < this.params.stepsPerFrame; i++) {
      this.step();
    }
  }

  // シミュレーションを1ステップ進める。9点加重ラプラシアンによるGray-Scott方程式。
  step(): void {
    const res = this.resolution;
    const { u, v, u2, v2, params } = this;
    const { feed, kill, du, dv, dt } = params;

    for (let y = 0; y < res; y++) {
      const ym = y === 0 ? res - 1 : y - 1;
      const yp = y === res - 1 ? 0 : y + 1;
      const rowC = y * res;
      const rowM = ym * res;
      const rowP = yp * res;

      for (let x = 0; x < res; x++) {
        const xm = x === 0 ? res - 1 : x - 1;
        const xp = x === res - 1 ? 0 : x + 1;
        const c = rowC + x;

        const cu = u[c];
        const cv = v[c];

        const lapU =
          (u[rowC + xm] + u[rowC + xp] + u[rowM + x] + u[rowP + x]) * 0.2 +
          (u[rowM + xm] + u[rowM + xp] + u[rowP + xm] + u[rowP + xp]) * 0.05 -
          cu;
        const lapV =
          (v[rowC + xm] + v[rowC + xp] + v[rowM + x] + v[rowP + x]) * 0.2 +
          (v[rowM + xm] + v[rowM + xp] + v[rowP + xm] + v[rowP + xp]) * 0.05 -
          cv;

        const uvv = cu * cv * cv;
        u2[c] = cu + (du * lapU - uvv + feed * (1 - cu)) * dt;
        v2[c] = cv + (dv * lapV + uvv - (feed + kill) * cv) * dt;
      }
    }

    // ping-pong: バッファを再確保せず参照を入れ替える。
    this.u = u2;
    this.v = v2;
    this.u2 = u;
    this.v2 = v;
  }
}
