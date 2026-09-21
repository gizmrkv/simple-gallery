// Factorio のバイター経路探索を 1セル=1タイル のグリッド上で再現する A*。
// 前提と出典、および実装しなかった要素の理由は docs/pathfinder-spec.md を参照。
//
// 核心: 壁は「通行不能」ではなく「コストを払えば通れる（＝壊して通る）」。
// これが迷路設計の緊張のすべてを生んでいる。
import type { PathParams } from "./types.ts";

const EPS = 1e-9;
const SQRT2 = Math.SQRT2;

// 近傍オフセット。0-3 が直交、4-7 が斜め。
const DX = [0, 0, -1, 1, -1, 1, -1, 1];
const DY = [-1, 1, 0, 0, -1, -1, 1, 1];

export class Pathfinder {
  readonly w: number;
  readonly h: number;
  private readonly n: number;

  // --- 探索の作業領域。すべてコンストラクタで確保し、solve 中は一切 alloc しない ---
  private readonly g: Float64Array; // ペナルティ込みの累積コスト
  private readonly travel: Float64Array; // 移動距離のみの累積（適応度が使うのはこちら）
  private readonly brk: Int32Array; // そこまでに破壊した壁タイル数
  private readonly ext: Int32Array; // extended penalty を踏んだ回数
  private readonly cameFrom: Int32Array;
  private readonly seen: Int32Array; // 世代スタンプ。!== runStamp なら未訪問
  private readonly closed: Int32Array; // 同上。展開済み判定
  private readonly nearWall: Uint8Array; // 壁に8近傍で接する非壁タイル
  private readonly hRow: Float64Array; // 行ごとのヒューリスティック値

  private readonly heapNode: Int32Array;
  private readonly heapF: Float64Array;
  private readonly heapG: Float64Array;
  private heapSize = 0;
  private runStamp = 0;

  // --- レーン別の結果。solveAll のたびに上書きされる ---
  readonly laneCost: Float64Array;
  readonly laneTravel: Float64Array;
  readonly laneBreaks: Int32Array;
  readonly laneExt: Int32Array;
  readonly laneExpanded: Int32Array;
  readonly laneReached: Uint8Array;
  /** レーン s の経路は lanePath[s*n .. s*n+lanePathLen[s]) にスタート順で入る。 */
  readonly lanePath: Int32Array;
  readonly lanePathLen: Int32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.n = n;

    this.g = new Float64Array(n);
    this.travel = new Float64Array(n);
    this.brk = new Int32Array(n);
    this.ext = new Int32Array(n);
    this.cameFrom = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.nearWall = new Uint8Array(n);
    this.hRow = new Float64Array(h);

    // 各辺につき高々1回 push されるので 8n で足りる（+1 はスタート）。
    const cap = n * 8 + 1;
    this.heapNode = new Int32Array(cap);
    this.heapF = new Float64Array(cap);
    this.heapG = new Float64Array(cap);

    this.laneCost = new Float64Array(w);
    this.laneTravel = new Float64Array(w);
    this.laneBreaks = new Int32Array(w);
    this.laneExt = new Int32Array(w);
    this.laneExpanded = new Int32Array(w);
    this.laneReached = new Uint8Array(w);
    this.lanePath = new Int32Array(w * n);
    this.lanePathLen = new Int32Array(w);
  }

  /**
   * 上端行の全セルを始点、下端行の任意セルを終点として W 本の探索を回す。
   * wantPaths のときだけ経路を lanePath に復元する（描画・検査用）。
   */
  solveAll(walls: Uint8Array, p: PathParams, wantPaths = false): void {
    this.buildNearWall(walls, p.extendedCollisionPenalty > 0);
    for (let y = 0; y < this.h; y++) {
      this.hRow[y] = p.goalPressureRatio * (this.h - 1 - y);
    }
    for (let x = 0; x < this.w; x++) {
      this.solveLane(x, walls, p, wantPaths);
    }
  }

  // 壁に8近傍で接する非壁タイルを立てる。extended penalty が 0 なら丸ごと不要。
  private buildNearWall(walls: Uint8Array, enabled: boolean): void {
    const { w, h, nearWall } = this;
    nearWall.fill(0);
    if (!enabled) return;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (walls[i]) continue;
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (walls[ny * w + nx]) {
            nearWall[i] = 1;
            break;
          }
        }
      }
    }
  }

  private solveLane(startX: number, walls: Uint8Array, p: PathParams, wantPath: boolean): void {
    const { w, h, n, g, travel, brk, ext, cameFrom, seen, closed, nearWall, hRow } = this;
    if (this.runStamp >= 0x7ffffffe) {
      // 世代スタンプが Int32 を使い切る前に巻き戻す（長時間走行時のみ到達）。
      this.seen.fill(0);
      this.closed.fill(0);
      this.runStamp = 0;
    }
    const stamp = ++this.runStamp;
    this.heapSize = 0;

    const goalFrom = n - w; // 下端行の先頭インデックス
    const neighborCount = p.allowDiagonal ? 8 : 4;
    const maxExp = p.maxExpansions;

    // スタート: バイターは盤外（y=-1、自由空間）から侵入してくる。
    // よって上端行のセルが壁なら「直前は壁ではない」＝通常の collisionPenalty を払う。
    const start = startX;
    const startPen =
      (walls[start] ? p.collisionPenalty : 0) +
      (nearWall[start] ? p.extendedCollisionPenalty : 0);
    g[start] = startPen;
    travel[start] = 0;
    brk[start] = walls[start] ? 1 : 0;
    ext[start] = nearWall[start] ? 1 : 0;
    cameFrom[start] = -1;
    seen[start] = stamp;
    this.heapPush(start, startPen + hRow[0], startPen);

    let expanded = 0;
    let goal = -1;

    while (this.heapSize > 0) {
      const u = this.heapPop();
      if (closed[u] === stamp) continue; // 遅延削除
      closed[u] = stamp;
      expanded++;

      if (u >= goalFrom) {
        goal = u;
        break;
      }
      if (maxExp > 0 && expanded >= maxExp) break;

      const ux = u % w;
      const uy = (u / w) | 0;
      const uWall = walls[u] !== 0;
      const ug = g[u];
      const ut = travel[u];
      const ub = brk[u];
      const ue = ext[u];

      for (let k = 0; k < neighborCount; k++) {
        const nx = ux + DX[k];
        const ny = uy + DY[k];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

        // 角抜け禁止: 斜めは肩タイルの両方が非壁でないと通れない。
        // 壁が「通行可能」であっても、角で接する2枚の壁の対角の隙間は幅0でユニットは通れない。
        // これが無いと市松模様の壁が実質無コストになり GA が壊れる。
        if (k >= 4 && (walls[uy * w + nx] || walls[ny * w + ux])) continue;

        const v = ny * w + nx;
        const vWall = walls[v] !== 0;
        const step = k >= 4 ? SQRT2 : 1;
        const pen =
          (vWall ? (uWall ? p.subsequentCollisionPenalty : p.collisionPenalty) : 0) +
          (nearWall[v] ? p.extendedCollisionPenalty : 0);

        const ng = ug + step + pen;
        const nt = ut + step;

        // 同コストで並んだときは travel が小さい方を採る＝防御側に悲観的な仮定。
        // これが無いと適応度が運のいい同点破りで水増しされる。
        // 展開済みノードは再オープンしない（重み付きA*の標準的な挙動）。
        if (closed[v] === stamp) continue;
        const fresh = seen[v] !== stamp;
        if (!fresh && !(ng < g[v] - EPS || (ng < g[v] + EPS && nt < travel[v] - EPS))) continue;

        seen[v] = stamp;
        g[v] = ng;
        travel[v] = nt;
        brk[v] = ub + (vWall ? 1 : 0);
        ext[v] = ue + (nearWall[v] ? 1 : 0);
        cameFrom[v] = u;
        this.heapPush(v, ng + hRow[ny], ng);
      }
    }

    const lane = startX;
    this.laneExpanded[lane] = expanded;
    if (goal < 0) {
      // maxExpansions による打ち切り。全タイルが通過可能なので、それ以外では起きない。
      this.laneReached[lane] = 0;
      this.laneCost[lane] = 0;
      this.laneTravel[lane] = 0;
      this.laneBreaks[lane] = 0;
      this.laneExt[lane] = 0;
      this.lanePathLen[lane] = 0;
      return;
    }
    this.laneReached[lane] = 1;
    this.laneCost[lane] = g[goal];
    this.laneTravel[lane] = travel[goal];
    this.laneBreaks[lane] = brk[goal];
    this.laneExt[lane] = ext[goal];

    if (!wantPath) {
      this.lanePathLen[lane] = 0;
      return;
    }
    // cameFrom を辿ると逆順なので、いったん末尾から詰めて前詰めし直す。
    const base = lane * n;
    let len = 0;
    for (let cur = goal; cur >= 0; cur = cameFrom[cur]) {
      this.lanePath[base + len] = cur;
      len++;
    }
    for (let i = 0, j = len - 1; i < j; i++, j--) {
      const t = this.lanePath[base + i];
      this.lanePath[base + i] = this.lanePath[base + j];
      this.lanePath[base + j] = t;
    }
    this.lanePathLen[lane] = len;
  }

  /** レーン s の経路を新しい配列にコピーして返す（描画用。ホットパスでは使わない）。 */
  pathOf(lane: number): Int32Array {
    const base = lane * this.n;
    return this.lanePath.slice(base, base + this.lanePathLen[lane]);
  }

  // --- 遅延削除つき二分ヒープ。decrease-key は実装しない ---

  // 比較は (f昇順, g降順, nodeId昇順) の3キー辞書順。
  // f 同点で g が大きい方を先に出すのは展開数を減らす定石。最後の nodeId で完全決定性を得る。
  private heapLess(i: number, j: number): boolean {
    const fi = this.heapF[i];
    const fj = this.heapF[j];
    if (fi < fj - EPS) return true;
    if (fj < fi - EPS) return false;
    const gi = this.heapG[i];
    const gj = this.heapG[j];
    if (gi > gj + EPS) return true;
    if (gj > gi + EPS) return false;
    return this.heapNode[i] < this.heapNode[j];
  }

  private heapSwap(i: number, j: number): void {
    const tn = this.heapNode[i];
    this.heapNode[i] = this.heapNode[j];
    this.heapNode[j] = tn;
    const tf = this.heapF[i];
    this.heapF[i] = this.heapF[j];
    this.heapF[j] = tf;
    const tg = this.heapG[i];
    this.heapG[i] = this.heapG[j];
    this.heapG[j] = tg;
  }

  private heapPush(node: number, f: number, gv: number): void {
    let i = this.heapSize++;
    this.heapNode[i] = node;
    this.heapF[i] = f;
    this.heapG[i] = gv;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.heapLess(i, parent)) break;
      this.heapSwap(i, parent);
      i = parent;
    }
  }

  private heapPop(): number {
    const top = this.heapNode[0];
    const last = --this.heapSize;
    if (last > 0) {
      this.heapNode[0] = this.heapNode[last];
      this.heapF[0] = this.heapF[last];
      this.heapG[0] = this.heapG[last];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= last) break;
        const r = l + 1;
        let m = l;
        if (r < last && this.heapLess(r, l)) m = r;
        if (!this.heapLess(m, i)) break;
        this.heapSwap(i, m);
        i = m;
      }
    }
    return top;
  }
}
