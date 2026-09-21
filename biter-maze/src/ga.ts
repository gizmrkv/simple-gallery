// 迷路（壁配置）を探索する遺伝的アルゴリズム。
// 遺伝子は 1セル1バイトの Uint8Array。集団は 1 本のフラットバッファで持ち、
// 個体 i は [i*n, (i+1)*n) を占める（worker へのチャンク送出が slice 一発になる）。
//
// 決定性の契約: 乱数を消費するのはこのクラスだけ。評価は純関数なので、
// worker 数や完了順が変わっても同一シードなら同一の集団が得られる。
import { Rng } from "./rng.ts";
import type { GaParams } from "./types.ts";

/** 適応度降順（同点は index 昇順）の順位を out に書く。Array.sort の安定性に依存しない。 */
export function rankOrder(fitness: Float64Array, popSize: number, out: Int32Array): void {
  for (let i = 0; i < popSize; i++) out[i] = i;
  const arr = Array.from(out.subarray(0, popSize));
  arr.sort((a, b) => {
    const fa = fitness[a];
    const fb = fitness[b];
    if (fa !== fb) return fb - fa;
    return a - b;
  });
  out.set(arr, 0);
}

function fnv1a(buf: Uint8Array, offset: number, n: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    hash ^= buf[offset + i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class Ga {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly popSize: number;

  /** 評価対象の現世代。worker はこのバッファのチャンクのコピーを受け取る。 */
  population: Uint8Array;
  private buffer: Uint8Array; // 次世代の書き込み先（毎世代 population と入れ替える）
  /** 個体を世代をまたいで追跡するための単調増加 ID（UI の選択追跡用）。 */
  ids: Int32Array;
  private nextIds: Int32Array;

  generation = 0;
  private nextId = 0;
  private rng: Rng;
  private params: GaParams;
  private order: Int32Array;
  private eliteHashes: Uint32Array;
  private pending: Uint8Array[] = [];

  constructor(w: number, h: number, params: GaParams) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.popSize = params.popSize;
    this.params = { ...params };
    this.rng = new Rng(params.seed);

    this.population = new Uint8Array(this.popSize * this.n);
    this.buffer = new Uint8Array(this.popSize * this.n);
    this.ids = new Int32Array(this.popSize);
    this.nextIds = new Int32Array(this.popSize);
    this.order = new Int32Array(this.popSize);
    this.eliteHashes = new Uint32Array(this.popSize);

    this.initialize();
  }

  /** GA を再構築せずに変えられるパラメータを差し替える（popSize/seed は除く）。 */
  setParams(params: GaParams): void {
    this.params = { ...this.params, ...params, popSize: this.popSize, seed: this.params.seed };
  }

  private initialize(): void {
    const { popSize, n } = this;
    for (let i = 0; i < popSize; i++) {
      const off = i * n;
      this.population.fill(0, off, off + n);
      if (i % 2 === 0) {
        // 密度をばらけさせたベルヌーイ
        const density = 0.1 + 0.4 * this.rng.next();
        for (let k = 0; k < n; k++) {
          if (this.rng.bool(density)) this.population[off + k] = 1;
        }
      } else {
        // ランダムな線分。第0世代から「壁らしい」ビルディングブロックを持たせる。
        const lines = this.rng.range(3, 10);
        for (let l = 0; l < lines; l++) this.drawLine(this.population, off, 1);
      }
      this.ids[i] = this.nextId++;
    }
    this.generation = 0;
  }

  // --- 構造変異のプリミティブ ---

  private drawLine(buf: Uint8Array, off: number, value: number): void {
    const { w, h } = this;
    const horizontal = this.rng.bool(0.5);
    const len = this.rng.range(3, Math.max(3, horizontal ? w : h));
    const x = this.rng.int(w);
    const y = this.rng.int(h);
    for (let k = 0; k < len; k++) {
      // 盤面の左右はつながっているので、横線は端で折り返す。縦線は盤外で止める。
      const cx = horizontal ? (x + k) % w : x;
      const cy = horizontal ? y : y + k;
      if (cy >= h) break;
      buf[off + cy * w + cx] = value;
    }
  }

  private drawRect(buf: Uint8Array, off: number, value: number): void {
    const { w, h } = this;
    const rw = this.rng.range(1, 4);
    const rh = this.rng.range(1, 4);
    const x = this.rng.int(w);
    const y = this.rng.int(h);
    for (let dy = 0; dy < rh; dy++) {
      const cy = y + dy;
      if (cy >= h) break;
      for (let dx = 0; dx < rw; dx++) {
        buf[off + cy * w + ((x + dx) % w)] = value;
      }
    }
  }

  // --- 選択・交叉・変異 ---

  private tournament(fitness: Float64Array): number {
    const k = Math.max(2, this.params.tournamentSize);
    let best = this.rng.int(this.popSize);
    for (let i = 1; i < k; i++) {
      const c = this.rng.int(this.popSize);
      // 同点は index の小さい方（完全決定性）
      if (fitness[c] > fitness[best] || (fitness[c] === fitness[best] && c < best)) best = c;
    }
    return best;
  }

  private crossover(dstOff: number, aOff: number, bOff: number): void {
    const { w, h, n, buffer, population } = this;
    buffer.set(population.subarray(aOff, aOff + n), dstOff);

    // x範囲は巡回させる。左右がつながった盤面で矩形が端で切れると、
    // x=0/x=w-1 の継ぎ目だけ組み換えが起きないという人工的な偏りが残るため。
    let x0 = this.rng.int(w);
    let lx = this.rng.range(1, w);
    let y0 = this.rng.int(h);
    let y1 = this.rng.int(h);
    if (y0 > y1) [y0, y1] = [y1, y0];
    // 確率 0.25 ずつで全幅／全高に広げる。これ1つで行バンド・列バンド・矩形の
    // 3 種類のブロック交叉が、ノブを増やさずに出る。
    if (this.rng.bool(0.25)) {
      x0 = 0;
      lx = w;
    }
    if (this.rng.bool(0.25)) {
      y0 = 0;
      y1 = h - 1;
    }
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let i = 0; i < lx; i++) {
        const x = (x0 + i) % w;
        buffer[dstOff + row + x] = population[bOff + row + x];
      }
    }
  }

  private mutate(off: number): void {
    const { n, buffer } = this;
    const p = this.params.mutationBits / n;
    if (p > 0) {
      for (let k = 0; k < n; k++) {
        if (this.rng.bool(p)) buffer[off + k] ^= 1;
      }
    }
    if (this.rng.bool(this.params.structuralMutationRate)) {
      // 「消す」系が無いと「ここを突破される」局所最適から抜け出せない。
      switch (this.rng.int(4)) {
        case 0:
          this.drawLine(buffer, off, 1);
          break;
        case 1:
          this.drawLine(buffer, off, 0);
          break;
        case 2:
          this.drawRect(buffer, off, 1);
          break;
        default:
          this.drawRect(buffer, off, 0);
          break;
      }
    }
  }

  private randomGenome(off: number): void {
    const { n, buffer } = this;
    buffer.fill(0, off, off + n);
    const density = 0.1 + 0.4 * this.rng.next();
    for (let k = 0; k < n; k++) {
      if (this.rng.bool(density)) buffer[off + k] = 1;
    }
  }

  /** ユーザーが描いた迷路を次世代に投入する。以後は他個体と全く同様に扱われる。 */
  inject(genome: Uint8Array): void {
    this.pending.push(genome.slice(0, this.n));
  }

  get pendingInjections(): number {
    return this.pending.length;
  }

  /** 評価済みの適応度から次世代を構築する。 */
  advance(fitness: Float64Array): void {
    const { popSize, n, order } = this;
    rankOrder(fitness, popSize, order);

    // エリート（重複排除つき）。これが無いとエリート枠が同一個体のコピーで埋まる。
    const wantElites = Math.min(Math.max(0, this.params.eliteCount), popSize);
    let elites = 0;
    for (let r = 0; r < popSize && elites < wantElites; r++) {
      const src = order[r];
      const srcOff = src * n;
      const hash = fnv1a(this.population, srcOff, n);
      let dup = false;
      for (let e = 0; e < elites; e++) {
        if (this.eliteHashes[e] === hash) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      this.eliteHashes[elites] = hash;
      this.buffer.set(this.population.subarray(srcOff, srcOff + n), elites * n);
      this.nextIds[elites] = this.ids[src]; // エリートは ID を引き継ぐ
      elites++;
    }

    for (let i = elites; i < popSize; i++) {
      const off = i * n;
      const a = this.tournament(fitness);
      if (this.rng.bool(this.params.crossoverRate)) {
        const b = this.tournament(fitness);
        this.crossover(off, a * n, b * n);
      } else {
        this.buffer.set(this.population.subarray(a * n, a * n + n), off);
      }
      this.mutate(off);
      this.nextIds[i] = this.nextId++;
    }

    // 末尾スロットを移民と注入で置き換える（早期収束への最も安い保険）。
    const immigrants = Math.min(
      Math.round(popSize * this.params.immigrantRate),
      Math.max(0, popSize - elites),
    );
    for (let k = 0; k < immigrants; k++) {
      const i = popSize - 1 - k;
      this.randomGenome(i * n);
      this.nextIds[i] = this.nextId++;
    }
    for (let k = 0; k < this.pending.length && k < popSize - elites; k++) {
      const i = popSize - 1 - k;
      this.buffer.set(this.pending[k], i * n);
      this.nextIds[i] = this.nextId++;
    }
    this.pending.length = 0;

    const tmpPop = this.population;
    this.population = this.buffer;
    this.buffer = tmpPop;
    const tmpIds = this.ids;
    this.ids = this.nextIds;
    this.nextIds = tmpIds;
    this.generation++;
  }

  /** 直近の advance で計算した順位（適応度降順）。 */
  get ranking(): Int32Array {
    return this.order;
  }

  genomeAt(i: number): Uint8Array {
    return this.population.subarray(i * this.n, (i + 1) * this.n);
  }
}
