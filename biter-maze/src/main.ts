import "./style.css";
import { Ga, rankOrder } from "./ga.ts";
import { WorkerEvaluator, extractFitness, type Evaluator } from "./evaluator.ts";
import { Pathfinder } from "./pathfinder.ts";
import { computeFitness, countWalls, UNREACHED_SCORE } from "./fitness.ts";
import { ChartRenderer, DetailRenderer, GalleryRenderer } from "./render.ts";
import { MazeEditor } from "./editor.ts";
import { createDefaultState, getEl, Ui } from "./ui.ts";

const state = createDefaultState();

const detailCanvas = getEl<HTMLCanvasElement>("detail");
const galleryCanvas = getEl<HTMLCanvasElement>("gallery");
const chartCanvas = getEl<HTMLCanvasElement>("chart");
const detail = new DetailRenderer(detailCanvas);
const gallery = new GalleryRenderer(galleryCanvas);
const chart = new ChartRenderer(chartCanvas);

// --- 実行状態 ---
let ga: Ga;
let evaluator: Evaluator;
let inspector: Pathfinder;
/** 評価が終わった世代のゲノム。描画器はこのスナップショットだけを読む。 */
let snapshotPop: Uint8Array;
let fitness: Float64Array;
let order: Int32Array;
let running = false;
let busy = false;
/** Reset のたびに増やし、走行中の評価の結果を捨てるために使う。 */
let epoch = 0;
let selectedRank = 0;
let galleryDirty = true;
let detailDirty = true;
let lastDetailHash = -1;
let genStamps: number[] = [];

const editor = new MazeEditor(detailCanvas, detail, state.mazeW, state.mazeH, () => {
  detailDirty = true;
});

const ui = new Ui(state, {
  onRunToggle: () => {
    running = !running;
    ui.setRunning(running);
    if (running) void tick();
  },
  onStep: () => {
    running = false;
    ui.setRunning(false);
    void tick();
  },
  onReset: () => reset(),
  onEditCopy: () => {
    editor.copyFrom(displayedGenome());
    detailDirty = true;
  },
  onEditClear: () => editor.clear(),
  onInject: () => {
    ga.inject(editor.buffer);
    ui.setGalleryHint(`注入を予約（次世代で集団に入る）`);
  },
  onLiveParamsChanged: () => {
    detailDirty = true;
  },
  onEditModeChanged: () => {
    editor.setEnabled(state.view.editMode);
    detailDirty = true;
    lastDetailHash = -1;
  },
});

// --- スナップショットの読み取り ---

function displayedGenome(): Uint8Array {
  if (state.view.editMode) return editor.buffer;
  const n = state.mazeW * state.mazeH;
  const idx = order[Math.min(selectedRank, ga.popSize - 1)];
  return snapshotPop.subarray(idx * n, (idx + 1) * n);
}

function hashGenome(g: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < g.length; i++) {
    hash ^= g[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 詳細ビューを作り直す。1個体あたり W 本の A* はマイクロ秒なので worker を経由せず
 * mainスレッドで直接評価する（エディタで塗りながらのライブ更新もこれで賄える）。
 */
function refreshDetail(force: boolean): void {
  const walls = displayedGenome();
  const hash = hashGenome(walls);
  if (!force && !detailDirty && hash === lastDetailHash) return;
  lastDetailHash = hash;
  detailDirty = false;

  const { mazeW: w, mazeH: h } = state;
  inspector.solveAll(walls, state.path, true);

  let worstLane = 0;
  let worstScore = Infinity;
  for (let s = 0; s < w; s++) {
    const score = inspector.laneReached[s]
      ? inspector.laneTravel[s] - state.fit.breakPenalty * inspector.laneBreaks[s]
      : UNREACHED_SCORE;
    if (score < worstScore) {
      worstScore = score;
      worstLane = s;
    }
  }

  const paths: Int32Array[] = [];
  for (let s = 0; s < w; s++) paths.push(inspector.pathOf(s));
  detail.setSnapshot({
    walls: walls.slice(),
    w,
    h,
    paths,
    laneTravel: inspector.laneTravel.slice(),
    laneBreaks: inspector.laneBreaks.slice(),
    worstLane,
  });

  const wallCount = countWalls(walls, 0, w * h);
  const stats = computeFitness(
    inspector.laneTravel,
    inspector.laneBreaks,
    inspector.laneReached,
    w,
    wallCount,
    state.fit,
  );
  ui.setSelected({
    fitness: stats.fitness,
    minScore: stats.minScore,
    meanScore: stats.meanScore,
    breaks: stats.totalBreaks,
    walls: wallCount,
    worstLane,
    worstTravel: inspector.laneTravel[worstLane],
  });
}

// --- 世代ループ。描画ループとは完全に分離する ---

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  const myEpoch = epoch;
  try {
    const stats = await evaluator.evaluate(
      ga.population,
      ga.popSize,
      state.mazeW,
      state.mazeH,
      state.path,
      state.fit,
    );
    if (myEpoch !== epoch) return;

    snapshotPop.set(ga.population);
    extractFitness(stats, ga.popSize, fitness);
    rankOrder(fitness, ga.popSize, order);

    let sum = 0;
    for (let i = 0; i < ga.popSize; i++) sum += fitness[i];
    const best = fitness[order[0]];
    const mean = sum / ga.popSize;
    chart.push(best, mean);

    genStamps.push(performance.now());
    if (genStamps.length > 30) genStamps.shift();
    const span =
      genStamps.length > 1 ? (genStamps[genStamps.length - 1] - genStamps[0]) / 1000 : 0;
    const gps = span > 0 ? (genStamps.length - 1) / span : 0;
    ui.setStats(ga.generation, best, mean, gps);

    galleryDirty = true;
    detailDirty = true;

    ga.setParams(state.ga);
    ga.advance(fitness);
  } catch {
    // 破棄されたジョブ（Reset / パラメータ変更）。次の tick が仕切り直す。
  } finally {
    busy = false;
  }
  if (running && myEpoch === epoch) {
    // worker 経由なら返信がマクロタスクなので rAF が間に挟まる。
    // 同期フォールバック時は明示的に譲らないと描画が止まる。
    if (evaluator.workerCount > 0) void tick();
    else setTimeout(() => void tick(), 0);
  }
}

// --- リセット ---

function reset(): void {
  epoch++;
  running = false;
  busy = false;
  ui.setRunning(false);
  if (evaluator) evaluator.dispose();
  evaluator = WorkerEvaluator.create(state.workerCount);

  const w = state.mazeW;
  const h = state.mazeH;
  ga = new Ga(w, h, state.ga);
  inspector = new Pathfinder(w, h);
  snapshotPop = new Uint8Array(ga.popSize * w * h);
  fitness = new Float64Array(ga.popSize);
  order = new Int32Array(ga.popSize);
  for (let i = 0; i < ga.popSize; i++) order[i] = i;
  snapshotPop.set(ga.population);

  editor.resize(w, h);
  editor.setEnabled(state.view.editMode);
  chart.reset();
  genStamps = [];
  selectedRank = 0;
  galleryDirty = true;
  lastDetailHash = -1;
  ui.setStats(0, NaN, NaN, 0);
  ui.setGalleryHint(
    evaluator.workerCount > 0
      ? `適応度降順。クリックで個体を検査（worker ${evaluator.workerCount}）`
      : "適応度降順。クリックで個体を検査（worker なし: 同期評価）",
  );
  refreshDetail(true);
}

// --- 入力 ---

galleryCanvas.addEventListener("click", (e) => {
  const rank = gallery.hitTest(e.clientX, e.clientY);
  if (rank < 0) return;
  selectedRank = rank;
  galleryDirty = true;
  lastDetailHash = -1;
  refreshDetail(true);
});

new ResizeObserver(() => {
  galleryDirty = true;
}).observe(galleryCanvas);

// --- 描画ループ ---

const t0 = performance.now();
function frame(now: number): void {
  refreshDetail(false);
  detail.draw(
    (now - t0) / 1000,
    state.view.showAllLanes,
    state.view.biterSpeed,
    state.view.editMode,
  );
  if (galleryDirty) {
    galleryDirty = false;
    gallery.draw(snapshotPop, ga.popSize, state.mazeW, state.mazeH, order, selectedRank);
    chart.draw();
  }
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // rAF が止まる非表示タブでも動作確認できるようにする（リポジトリ共通の慣習）。
  (window as unknown as { __sim: unknown }).__sim = {
    state,
    get ga() {
      return ga;
    },
    get best() {
      return displayedGenome();
    },
    async run(n = 10) {
      for (let i = 0; i < n; i++) await tick();
      return { generation: ga.generation, best: fitness[order[0]] };
    },
    evaluate(walls: Uint8Array) {
      inspector.solveAll(walls, state.path, false);
      return {
        travel: Array.from(inspector.laneTravel),
        breaks: Array.from(inspector.laneBreaks),
        cost: Array.from(inspector.laneCost),
      };
    },
  };
}
