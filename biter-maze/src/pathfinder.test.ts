import { describe, it, expect } from "vitest";
import { Pathfinder } from "./pathfinder.ts";
import { DEFAULT_PATH_PARAMS, type PathParams } from "./types.ts";

const W = 16;
const H = 16;

function params(over: Partial<PathParams> = {}): PathParams {
  return { ...DEFAULT_PATH_PARAMS, ...over };
}

function blank(w = W, h = H): Uint8Array {
  return new Uint8Array(w * h);
}

function setRow(walls: Uint8Array, y: number, w = W): void {
  for (let x = 0; x < w; x++) walls[y * w + x] = 1;
}

// ---- 参照実装: ヒューリスティック無しの Dijkstra。A* とは独立に書く（オラクル） ----
function refDijkstra(walls: Uint8Array, startX: number, p: PathParams, w = W, h = H): number {
  const n = w * h;
  const near = new Uint8Array(n);
  if (p.extendedCollisionPenalty > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (walls[i]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            const nx = (x + dx + w) % w; // 左右はつながっている
            if (walls[ny * w + nx]) near[i] = 1;
          }
        }
      }
    }
  }
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[startX] =
    (walls[startX] ? p.collisionPenalty : 0) + (near[startX] ? p.extendedCollisionPenalty : 0);
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u < 0) break;
    done[u] = 1;
    if (u >= n - w) return dist[u];
    const ux = u % w;
    const uy = (u / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const diag = dx !== 0 && dy !== 0;
        if (diag && !p.allowDiagonal) continue;
        const ny = uy + dy;
        if (ny < 0 || ny >= h) continue;
        const nx = (ux + dx + w) % w; // 左右はつながっている
        if (diag && (walls[uy * w + nx] || walls[ny * w + ux])) continue;
        const v = ny * w + nx;
        const pen =
          (walls[v] ? (walls[u] ? p.subsequentCollisionPenalty : p.collisionPenalty) : 0) +
          (near[v] ? p.extendedCollisionPenalty : 0);
        const nd = dist[u] + (diag ? Math.SQRT2 : 1) + pen;
        if (nd < dist[v]) dist[v] = nd;
      }
    }
  }
  return Infinity;
}

describe("Pathfinder", () => {
  it("空盤では全レーンが真下に直進する", () => {
    const pf = new Pathfinder(W, H);
    pf.solveAll(blank(), params(), true);
    for (let s = 0; s < W; s++) {
      expect(pf.laneReached[s]).toBe(1);
      expect(pf.laneTravel[s]).toBeCloseTo(15, 9);
      expect(pf.laneCost[s]).toBeCloseTo(15, 9);
      expect(pf.laneBreaks[s]).toBe(0);
      const path = pf.pathOf(s);
      expect(path.length).toBe(16);
      for (let i = 0; i < 16; i++) expect(path[i]).toBe(i * W + s);
    }
  });

  it("壁1枚は迂回する。角抜けは禁止なので横に1歩ずれる", () => {
    // 壁 (8,1) のみ。斜め (8,0)->(7,1) は肩 (8,1) が壁なので禁止。
    // よって (8,0)->(7,0)->(7,1)->...->(7,15) で travel=16。貫通なら cost=25。
    const walls = blank();
    walls[1 * W + 8] = 1;
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, params(), true);
    expect(pf.laneBreaks[8]).toBe(0);
    expect(pf.laneTravel[8]).toBeCloseTo(16, 9);
    expect(pf.laneCost[8]).toBeCloseTo(16, 9);
  });

  it("全幅の壁1行は迂回不能なので1枚だけ壊して直進する", () => {
    const walls = blank();
    setRow(walls, 8);
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, params(), false);
    for (let s = 0; s < W; s++) {
      expect(pf.laneBreaks[s]).toBe(1);
      expect(pf.laneTravel[s]).toBeCloseTo(15, 9);
      // 15 の移動 + collisionPenalty 10
      expect(pf.laneCost[s]).toBeCloseTo(25, 9);
    }
  });

  it("厚さ2の壁では2枚目に subsequent penalty が適用される", () => {
    // 製品全体が乗っている意味論。1枚目は 10、2枚目は直前も壁なので 3。
    const walls = blank();
    setRow(walls, 7);
    setRow(walls, 8);
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, params(), false);
    for (let s = 0; s < W; s++) {
      expect(pf.laneBreaks[s]).toBe(2);
      expect(pf.laneTravel[s]).toBeCloseTo(15, 9);
      expect(pf.laneCost[s]).toBeCloseTo(15 + 10 + 3, 9); // = 28
    }
  });

  it("迂回が collisionPenalty を超えると壊して直進する（製品の核心）", () => {
    // 4近傍・gpr=1（admissible）なので最小コスト経路が保証され、手計算と厳密に一致する。
    // 左右がつながっているため迂回距離は巡回距離 min(d, W-d)。W=16 では最大8で
    // collisionPenalty=10 を超えられないので、この閾値テストだけ W=32 で行う。
    const p = params({ allowDiagonal: false, goalPressureRatio: 1 });
    const w = 32;
    // y=1 を全幅の壁にし、gapX にだけ隙間を開ける。start は x=0。
    //   迂回 = min(gapX, 32-gapX) + 15,  貫通 = 15 + 10 = 25
    const build = (gapX: number): Uint8Array => {
      const walls = blank(w, H);
      setRow(walls, 1, w);
      walls[1 * w + gapX] = 0;
      return walls;
    };

    const detour = new Pathfinder(w, H);
    detour.solveAll(build(9), p, false); // 巡回距離9 → 迂回24 < 貫通25
    expect(detour.laneBreaks[0]).toBe(0);
    expect(detour.laneTravel[0]).toBeCloseTo(24, 9);

    const breakThrough = new Pathfinder(w, H);
    breakThrough.solveAll(build(11), p, false); // 巡回距離11 → 迂回26 > 貫通25
    expect(breakThrough.laneBreaks[0]).toBe(1);
    expect(breakThrough.laneTravel[0]).toBeCloseTo(15, 9);
    expect(breakThrough.laneCost[0]).toBeCloseTo(25, 9);
  });

  it("左右はつながっているので盤の端を回り込んで迂回できる", () => {
    // y=8 を全幅の壁にし、x=0 だけ開ける。start は x=15。
    // 左右が独立なら迂回は横に15歩必要で貫通(25)のほうが安いが、
    // つながっていれば x=15 → x=0 は1歩なので travel=16 で抜けられる。
    const p = params({ allowDiagonal: false, goalPressureRatio: 1 });
    const walls = blank();
    setRow(walls, 8);
    walls[8 * W + 0] = 0;
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, p, true);

    expect(pf.laneBreaks[15]).toBe(0);
    expect(pf.laneTravel[15]).toBeCloseTo(16, 9);
    const path = Array.from(pf.pathOf(15));
    expect(path.length).toBe(17); // 16歩 + 始点
    const xs = path.map((i) => i % W);
    expect(xs).toContain(15);
    expect(xs).toContain(0);
  });

  it("角抜け禁止: 斜めにしか繋がっていない隙間は通れない", () => {
    // y=7,y=8 を全幅の壁にし、(5,7) と (6,8) だけ開ける。
    // 唯一の接続は斜め (5,7)->(6,8) だが肩 (6,7),(5,8) が両方壁なので不通。
    // 角抜けを許すバグがあると breaks=0 になる。
    const walls = blank();
    setRow(walls, 7);
    setRow(walls, 8);
    walls[7 * W + 5] = 0;
    walls[8 * W + 6] = 0;
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, params(), false);
    for (let s = 0; s < W; s++) {
      expect(pf.laneBreaks[s]).toBeGreaterThanOrEqual(1);
    }
  });

  it("extended penalty のヒット数が経路上の壁隣接タイル数と一致する", () => {
    const walls = blank();
    walls[5 * W + 0] = 1; // 端に置く: x=15 が巡回で隣接する
    walls[9 * W + 9] = 1;
    const p = params({ extendedCollisionPenalty: 3 });
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, p, true);
    for (let s = 0; s < W; s++) {
      const path = pf.pathOf(s);
      let expected = 0;
      for (const i of path) {
        if (walls[i]) continue;
        const x = i % W;
        const y = (i / W) | 0;
        let adj = false;
        for (let dy = -1; dy <= 1 && !adj; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            const nx = (x + dx + W) % W; // 左右はつながっている
            if (walls[ny * W + nx]) {
              adj = true;
              break;
            }
          }
        }
        if (adj) expected++;
      }
      expect(pf.laneExt[s]).toBe(expected);
    }
  });

  it("gpr=1 では Dijkstra と厳密一致し、gpr=2 では下回らない", () => {
    // 緩和条件・ヒープ比較・コスト関数のバグを広く捕まえる性質テスト。
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pf = new Pathfinder(W, H);
    for (let trial = 0; trial < 50; trial++) {
      const density = 0.1 + 0.4 * rand();
      const walls = blank();
      for (let i = 0; i < W * H; i++) walls[i] = rand() < density ? 1 : 0;

      const pAdm = params({ goalPressureRatio: 1 });
      pf.solveAll(walls, pAdm, false);
      for (let s = 0; s < W; s++) {
        expect(pf.laneCost[s]).toBeCloseTo(refDijkstra(walls, s, pAdm), 9);
      }

      const pW = params({ goalPressureRatio: 2 });
      pf.solveAll(walls, pW, false);
      for (let s = 0; s < W; s++) {
        expect(pf.laneCost[s]).toBeGreaterThanOrEqual(refDijkstra(walls, s, pAdm) - 1e-9);
      }
    }
  });

  it("事前確保した配列を使い回しても結果が汚れない", () => {
    const a = blank();
    setRow(a, 4);
    a[4 * W + 2] = 0;
    const b = blank();
    setRow(b, 10);

    const pf = new Pathfinder(W, H);
    pf.solveAll(a, params(), false);
    const first = Array.from(pf.laneCost);

    pf.solveAll(b, params(), false);
    pf.solveAll(a, params(), false);
    expect(Array.from(pf.laneCost)).toEqual(first);

    // 別インスタンスでも同一
    const pf2 = new Pathfinder(W, H);
    pf2.solveAll(a, params(), false);
    expect(Array.from(pf2.laneCost)).toEqual(first);
  });

  it("左右対称な盤でも選ばれる経路が毎回同じ（同点破りの決定性）", () => {
    const walls = blank();
    // 中央に左右対称な障害物を置き、鏡像の2経路が同コストになるようにする
    for (let y = 4; y <= 6; y++) walls[y * W + 7] = 1;
    for (let y = 4; y <= 6; y++) walls[y * W + 8] = 1;
    const pf = new Pathfinder(W, H);
    pf.solveAll(walls, params(), true);
    const ref = Array.from(pf.pathOf(7));
    for (let rep = 0; rep < 5; rep++) {
      pf.solveAll(walls, params(), true);
      expect(Array.from(pf.pathOf(7))).toEqual(ref);
    }
  });
});
