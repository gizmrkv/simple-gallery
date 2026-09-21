// 3つの描画器。いずれも「最後に完了した世代のスナップショット」だけを読む。
// GAループとは完全に分離されており、rAF に絞って描く。

const COL_FREE = [20, 20, 26];
const COL_WALL = [107, 114, 128]; // --wall
const COL_GUTTER = [10, 10, 15]; // --bg-color
const COL_BROKEN = [239, 68, 68]; // --danger

/** 壁を壊されずに歩くバイターが、壁1枚をかじるのにかかる時間（タイル移動換算）。 */
const CHEW_TILES = 2.5;

function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): number {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.max(1, Math.round(cssW * dpr));
  const ph = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return dpr;
}

// ---------------------------------------------------------------- Gallery

/**
 * 集団のサムネイルを canvas 1枚のアトラスとして描く。
 * 個体ごとに <canvas> を作らないので、pop 400 でも描画コストが破綻しない。
 */
export class GalleryRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas = document.createElement("canvas");
  private atlasCtx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private cols = 1;
  private rows = 1;
  private scale = 1;
  private originX = 0;
  private originY = 0;
  private popSize = 0;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.atlasCtx = this.atlas.getContext("2d")!;
  }

  /** order[rank] = 個体index。表示は適応度降順。 */
  draw(
    pop: Uint8Array,
    popSize: number,
    w: number,
    h: number,
    order: Int32Array,
    selectedRank: number,
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = fitCanvas(this.canvas, rect.width, rect.height);
    const ctx = this.ctx;

    // 1セル1ピクセル + 1px の溝。列数は面積が最大になるものを選ぶ。
    const tw = w + 1;
    const th = h + 1;
    let bestCols = 1;
    let bestScale = 0;
    for (let cols = 1; cols <= popSize; cols++) {
      const rows = Math.ceil(popSize / cols);
      const s = Math.min(rect.width / (cols * tw), rect.height / (rows * th));
      if (s > bestScale) {
        bestScale = s;
        bestCols = cols;
      }
    }
    this.cols = bestCols;
    this.rows = Math.ceil(popSize / bestCols);
    this.scale = bestScale;
    this.popSize = popSize;
    this.w = w;
    this.h = h;

    const aw = this.cols * tw;
    const ah = this.rows * th;
    if (this.atlas.width !== aw || this.atlas.height !== ah || !this.image) {
      this.atlas.width = aw;
      this.atlas.height = ah;
      this.image = this.atlasCtx.createImageData(aw, ah);
    }
    const img = this.image;
    const data = img.data;
    // 溝の色で塗り潰してから各個体を書き込む
    for (let i = 0; i < data.length; i += 4) {
      data[i] = COL_GUTTER[0];
      data[i + 1] = COL_GUTTER[1];
      data[i + 2] = COL_GUTTER[2];
      data[i + 3] = 255;
    }
    const n = w * h;
    for (let rank = 0; rank < popSize; rank++) {
      const idx = order[rank];
      const off = idx * n;
      const cx = (rank % this.cols) * tw;
      const cy = ((rank / this.cols) | 0) * th;
      for (let y = 0; y < h; y++) {
        let p = ((cy + y) * aw + cx) * 4;
        for (let x = 0; x < w; x++) {
          const c = pop[off + y * w + x] ? COL_WALL : COL_FREE;
          data[p] = c[0];
          data[p + 1] = c[1];
          data[p + 2] = c[2];
          p += 4;
        }
      }
    }
    this.atlasCtx.putImageData(img, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const dw = aw * bestScale;
    const dh = ah * bestScale;
    this.originX = (rect.width - dw) / 2;
    this.originY = 0;
    ctx.drawImage(this.atlas, this.originX * dpr, this.originY * dpr, dw * dpr, dh * dpr);

    // 最良個体と選択中個体を枠で示す
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    const frame = (rank: number, color: string) => {
      const x = this.originX + (rank % this.cols) * tw * bestScale;
      const y = this.originY + ((rank / this.cols) | 0) * th * bestScale;
      ctx.strokeStyle = color;
      ctx.strokeRect(x * dpr, y * dpr, w * bestScale * dpr, h * bestScale * dpr);
    };
    frame(0, "rgba(250, 204, 21, 0.9)");
    if (selectedRank >= 0 && selectedRank < popSize) frame(selectedRank, "#4f46e5");
  }

  /** クリック座標 → 表示順の rank。外れたら -1。 */
  hitTest(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left - this.originX;
    const y = clientY - rect.top - this.originY;
    const tw = (this.w + 1) * this.scale;
    const th = (this.h + 1) * this.scale;
    if (x < 0 || y < 0) return -1;
    const col = Math.floor(x / tw);
    const row = Math.floor(y / th);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    const rank = row * this.cols + col;
    return rank < this.popSize ? rank : -1;
  }
}

// ---------------------------------------------------------------- Detail

export interface DetailSnapshot {
  walls: Uint8Array;
  w: number;
  h: number;
  paths: Int32Array[];
  laneTravel: Float64Array;
  laneBreaks: Int32Array;
  worstLane: number;
}

export class DetailRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private snap: DetailSnapshot | null = null;
  /** レーンごとの到達時刻（タイル移動換算。実時間は biterSpeed で割る）。 */
  private timeline: Float64Array[] = [];
  private totals: number[] = [];
  /** 経路が破壊するタイル。赤く描く。 */
  private broken = new Set<number>();
  private cell = 1;
  private ox = 0;
  private oy = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  setSnapshot(snap: DetailSnapshot | null): void {
    this.snap = snap;
    this.timeline = [];
    this.totals = [];
    this.broken.clear();
    if (!snap) return;
    const { walls, w, paths } = snap;
    for (const path of paths) {
      const t = new Float64Array(path.length);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = (b % w) - (a % w);
        const dy = ((b / w) | 0) - ((a / w) | 0);
        const dist = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        const chew = walls[b] ? CHEW_TILES : 0;
        t[i] = t[i - 1] + chew + dist;
        if (walls[b]) this.broken.add(b);
      }
      this.timeline.push(t);
      this.totals.push(t.length > 0 ? t[t.length - 1] : 0);
    }
  }

  /** 表示座標 → セルindex。エディタの塗りに使う。外れたら -1。 */
  cellAt(clientX: number, clientY: number): number {
    if (!this.snap) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - this.ox) / this.cell);
    const y = Math.floor((clientY - rect.top - this.oy) / this.cell);
    const { w, h } = this.snap;
    if (x < 0 || x >= w || y < 0 || y >= h) return -1;
    return y * w + x;
  }

  draw(elapsedSec: number, showAllLanes: boolean, biterSpeed: number, editMode: boolean): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
    const dpr = fitCanvas(this.canvas, size, size);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#14141a";
    ctx.fillRect(0, 0, size, size);

    const snap = this.snap;
    if (!snap) return;
    const { walls, w, h, paths, worstLane } = snap;

    const cell = Math.min(size / w, size / h);
    this.cell = cell;
    this.ox = (size - cell * w) / 2;
    this.oy = (size - cell * h) / 2;
    ctx.translate(this.ox, this.oy);

    // ゴール行（下端）を淡く着色
    ctx.fillStyle = "rgba(34, 197, 94, 0.10)";
    ctx.fillRect(0, (h - 1) * cell, w * cell, cell);
    // スタート行（上端）
    ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
    ctx.fillRect(0, 0, w * cell, cell);

    // 壁。バイターに壊されるものは赤。
    for (let i = 0; i < w * h; i++) {
      if (!walls[i]) continue;
      const broken = this.broken.has(i);
      ctx.fillStyle = broken
        ? `rgb(${COL_BROKEN[0]}, ${COL_BROKEN[1]}, ${COL_BROKEN[2]})`
        : `rgb(${COL_WALL[0]}, ${COL_WALL[1]}, ${COL_WALL[2]})`;
      ctx.fillRect((i % w) * cell, ((i / w) | 0) * cell, cell, cell);
    }

    // グリッド線
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, h * cell);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(w * cell, y * cell);
    }
    ctx.stroke();

    if (editMode) {
      ctx.strokeStyle = "rgba(79, 70, 229, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, w * cell, h * cell);
      return;
    }

    const cx = (i: number) => ((i % w) + 0.5) * cell;
    const cy = (i: number) => (((i / w) | 0) + 0.5) * cell;

    // 経路。最弱レーン（適応度の min を与えるレーン）だけ accent で強調する。
    ctx.lineWidth = Math.max(1.5, cell * 0.12);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let s = 0; s < paths.length; s++) {
      if (!showAllLanes && s !== worstLane) continue;
      const path = paths[s];
      if (path.length < 2) continue;
      ctx.strokeStyle = s === worstLane ? "#4f46e5" : "rgba(79, 70, 229, 0.25)";
      ctx.beginPath();
      ctx.moveTo(cx(path[0]), cy(path[0]));
      for (let i = 1; i < path.length; i++) ctx.lineTo(cx(path[i]), cy(path[i]));
      ctx.stroke();
    }

    // バイター本体
    if (biterSpeed > 0) {
      const r = Math.max(2, cell * 0.24);
      for (let s = 0; s < paths.length; s++) {
        if (!showAllLanes && s !== worstLane) continue;
        const path = paths[s];
        const t = this.timeline[s];
        const total = this.totals[s];
        if (!t || total <= 0 || path.length < 2) continue;
        const tau = (elapsedSec * biterSpeed) % total;
        // 到達時刻列は単調増加なので線形走査で十分（経路長は高々 w*h）。
        let i = 1;
        while (i < t.length - 1 && t[i] < tau) i++;
        const prev = path[i - 1];
        const next = path[i];
        const chew = walls[next] ? CHEW_TILES : 0;
        const moveStart = t[i - 1] + chew;
        let px: number;
        let py: number;
        if (tau < moveStart) {
          // かじっている最中。対象タイルを明滅させる。
          px = cx(prev);
          py = cy(prev);
          const pulse = 0.35 + 0.35 * Math.sin(elapsedSec * 14);
          ctx.fillStyle = `rgba(239, 68, 68, ${pulse.toFixed(3)})`;
          ctx.fillRect((next % w) * cell, ((next / w) | 0) * cell, cell, cell);
        } else {
          const dur = t[i] - moveStart;
          const k = dur > 0 ? (tau - moveStart) / dur : 1;
          px = cx(prev) + (cx(next) - cx(prev)) * k;
          py = cy(prev) + (cy(next) - cy(prev)) * k;
        }
        ctx.fillStyle = s === worstLane ? "#fbbf24" : "#e5e7eb";
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- Chart

export class ChartRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  best: number[] = [];
  mean: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  reset(): void {
    this.best.length = 0;
    this.mean.length = 0;
  }

  push(best: number, mean: number): void {
    this.best.push(best);
    this.mean.push(mean);
    // 長時間走行でメモリが伸び続けないよう、古い方を間引く。
    if (this.best.length > 2000) {
      this.best = this.best.filter((_, i) => i % 2 === 0);
      this.mean = this.mean.filter((_, i) => i % 2 === 0);
    }
  }

  draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = fitCanvas(this.canvas, rect.width, rect.height);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (this.best.length < 2) return;

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < this.best.length; i++) {
      lo = Math.min(lo, this.mean[i], this.best[i]);
      hi = Math.max(hi, this.best[i]);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    if (hi - lo < 1e-6) hi = lo + 1;

    const pad = 4;
    const line = (series: number[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const x = pad + (i / (series.length - 1)) * (rect.width - pad * 2);
        const y =
          rect.height - pad - ((series[i] - lo) / (hi - lo)) * (rect.height - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    line(this.mean, "rgba(156, 163, 175, 0.7)");
    line(this.best, "#4f46e5");
  }
}
