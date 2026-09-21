// コントロールは index.html に手書きし、ここは getElementById で配線するだけ
// （noise / turing-pattern / grid-index と同じ方針）。
import {
  DEFAULT_FITNESS_PARAMS,
  DEFAULT_GA_PARAMS,
  DEFAULT_PATH_PARAMS,
  type FitnessParams,
  type GaParams,
  type PathParams,
} from "./types.ts";

export interface ViewParams {
  biterSpeed: number;
  showAllLanes: boolean;
  editMode: boolean;
}

export interface AppState {
  mazeW: number;
  mazeH: number;
  workerCount: number;
  path: PathParams;
  fit: FitnessParams;
  ga: GaParams;
  view: ViewParams;
}

export interface UiCallbacks {
  onRunToggle(): void;
  onStep(): void;
  onReset(): void;
  onEditCopy(): void;
  onEditClear(): void;
  onInject(): void;
  /** 経路探索・適応度・GA のパラメータ変更。全個体を毎世代再評価するので次世代から効く。 */
  onLiveParamsChanged(): void;
  onEditModeChanged(): void;
  /** 迷路サイズの確定（スライダーを離したとき）。集団を作り直す必要がある。 */
  onSizeCommitted(): void;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function createDefaultState(): AppState {
  const cores = navigator.hardwareConcurrency ?? 4;
  return {
    mazeW: 16,
    mazeH: 16,
    // 小さなジョブでは postMessage のオーバヘッドが支配的になるので 8 で打ち止め。
    workerCount: Math.max(1, Math.min(cores, 8)),
    path: { ...DEFAULT_PATH_PARAMS },
    fit: { ...DEFAULT_FITNESS_PARAMS },
    ga: { ...DEFAULT_GA_PARAMS },
    view: { biterSpeed: 6, showAllLanes: true, editMode: false },
  };
}

export class Ui {
  private runBtn: HTMLButtonElement;
  private syncers: (() => void)[] = [];

  constructor(state: AppState, cb: UiCallbacks) {
    this.runBtn = el<HTMLButtonElement>("runBtn");

    this.runBtn.addEventListener("click", cb.onRunToggle);
    el("stepBtn").addEventListener("click", cb.onStep);
    el("resetBtn").addEventListener("click", cb.onReset);
    el("editCopyBtn").addEventListener("click", cb.onEditCopy);
    el("editClearBtn").addEventListener("click", cb.onEditClear);
    el("injectBtn").addEventListener("click", cb.onInject);

    const live = cb.onLiveParamsChanged;
    // Reset で反映されるもの（集団を作り直す必要がある）は onChange を呼ばない。
    const noop = () => {};

    const commitSize = cb.onSizeCommitted;
    this.range("mazeWidth", (v) => (state.mazeW = v), (v) => `${v}`, () => state.mazeW, noop, commitSize);
    this.range("mazeHeight", (v) => (state.mazeH = v), (v) => `${v}`, () => state.mazeH, noop, commitSize);

    const p = state.path;
    this.range("goalPressureRatio", (v) => (p.goalPressureRatio = v), (v) => v.toFixed(1), () => p.goalPressureRatio, live);
    this.range("collisionPenalty", (v) => (p.collisionPenalty = v), (v) => v.toFixed(1), () => p.collisionPenalty, live);
    this.range("subsequentCollisionPenalty", (v) => (p.subsequentCollisionPenalty = v), (v) => v.toFixed(1), () => p.subsequentCollisionPenalty, live);
    this.range("extendedCollisionPenalty", (v) => (p.extendedCollisionPenalty = v), (v) => v.toFixed(2), () => p.extendedCollisionPenalty, live);
    this.range("maxExpansions", (v) => (p.maxExpansions = v), (v) => (v === 0 ? "∞" : `${v}`), () => p.maxExpansions, live);
    this.check("allowDiagonal", (v) => (p.allowDiagonal = v), () => p.allowDiagonal, live);

    const f = state.fit;
    this.range("alpha", (v) => (f.alpha = v), (v) => v.toFixed(2), () => f.alpha, live);
    this.range("breakPenalty", (v) => (f.breakPenalty = v), (v) => v.toFixed(0), () => f.breakPenalty, live);
    this.range("wallCost", (v) => (f.wallCost = v), (v) => v.toFixed(2), () => f.wallCost, live);

    const g = state.ga;
    this.range("popSize", (v) => (g.popSize = v), (v) => `${v}`, () => g.popSize, noop);
    this.range("eliteCount", (v) => (g.eliteCount = v), (v) => `${v}`, () => g.eliteCount, live);
    this.range("tournamentSize", (v) => (g.tournamentSize = v), (v) => `${v}`, () => g.tournamentSize, live);
    this.range("crossoverRate", (v) => (g.crossoverRate = v), (v) => v.toFixed(2), () => g.crossoverRate, live);
    this.range("mutationBits", (v) => (g.mutationBits = v), (v) => v.toFixed(1), () => g.mutationBits, live);
    this.range("structuralMutationRate", (v) => (g.structuralMutationRate = v), (v) => v.toFixed(2), () => g.structuralMutationRate, live);
    this.range("immigrantRate", (v) => (g.immigrantRate = v), (v) => v.toFixed(2), () => g.immigrantRate, live);
    this.range("workerCount", (v) => (state.workerCount = v), (v) => `${v}`, () => state.workerCount, noop);

    const seedInput = el<HTMLInputElement>("seed");
    const syncSeed = () => {
      seedInput.value = `${state.ga.seed}`;
    };
    seedInput.addEventListener("change", () => {
      const v = Number(seedInput.value);
      state.ga.seed = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
      syncSeed();
    });
    el("randomSeedBtn").addEventListener("click", () => {
      state.ga.seed = (Math.random() * 0x7fffffff) | 0;
      syncSeed();
    });
    this.syncers.push(syncSeed);

    const v = state.view;
    this.range("biterSpeed", (val) => (v.biterSpeed = val), (val) => (val === 0 ? "停止" : val.toFixed(1)), () => v.biterSpeed, noop);
    this.check("showAllLanes", (val) => (v.showAllLanes = val), () => v.showAllLanes, noop);
    this.check("editMode", (val) => (v.editMode = val), () => v.editMode, cb.onEditModeChanged);

    const maxWorkers = Math.max(1, navigator.hardwareConcurrency ?? 4);
    el<HTMLInputElement>("workerCount").max = `${maxWorkers}`;
    this.syncAll();
  }

  private range(
    id: string,
    set: (v: number) => void,
    fmt: (v: number) => string,
    get: () => number,
    onChange: () => void,
    onCommit?: () => void,
  ): void {
    const input = el<HTMLInputElement>(id);
    const display = document.getElementById(`${id}Value`);
    const sync = () => {
      input.value = `${get()}`;
      if (display) display.textContent = fmt(get());
    };
    input.addEventListener("input", () => {
      set(Number(input.value));
      if (display) display.textContent = fmt(get());
      onChange();
    });
    // ドラッグ中は input が毎ピクセル飛ぶので、作り直しが要るものは change で確定させる。
    if (onCommit) input.addEventListener("change", onCommit);
    this.syncers.push(sync);
  }

  private check(id: string, set: (v: boolean) => void, get: () => boolean, onChange: () => void): void {
    const input = el<HTMLInputElement>(id);
    const sync = () => {
      input.checked = get();
    };
    input.addEventListener("change", () => {
      set(input.checked);
      onChange();
    });
    this.syncers.push(sync);
  }

  /** state の値をすべてコントロールに書き戻す。 */
  syncAll(): void {
    for (const s of this.syncers) s();
  }

  setRunning(running: boolean): void {
    this.runBtn.textContent = running ? "Pause" : "Start";
  }

  setStats(generation: number, best: number, mean: number, gensPerSec: number): void {
    el("roGen").textContent = `${generation}`;
    el("roBest").textContent = Number.isFinite(best) ? best.toFixed(2) : "-";
    el("roMean").textContent = Number.isFinite(mean) ? mean.toFixed(2) : "-";
    el("roSpeed").textContent = gensPerSec > 0 ? `${gensPerSec.toFixed(1)} gen/s` : "-";
  }

  setSelected(
    info: {
      fitness: number;
      minScore: number;
      meanScore: number;
      breaks: number;
      walls: number;
      worstLane: number;
      worstTravel: number;
    } | null,
  ): void {
    if (!info) {
      for (const id of ["roSelFit", "roSelScore", "roSelBreaks", "roSelWalls", "roSelWorst"]) {
        el(id).textContent = "-";
      }
      return;
    }
    el("roSelFit").textContent = info.fitness.toFixed(2);
    el("roSelScore").textContent = `${info.minScore.toFixed(1)} / ${info.meanScore.toFixed(1)}`;
    el("roSelBreaks").textContent = `${info.breaks}`;
    el("roSelWalls").textContent = `${info.walls}`;
    el("roSelWorst").textContent = `x=${info.worstLane} (travel ${info.worstTravel.toFixed(1)})`;
  }

  setGalleryHint(text: string): void {
    el("galleryHint").textContent = text;
  }
}

export { el as getEl };
