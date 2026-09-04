export type PuyoColor = "red" | "green" | "blue" | "yellow";
export type Cell = PuyoColor | null;
export type Board = Cell[][]; // board[row][col], row 0 = 最上段(隠し行)

export type Rotation = 0 | 1 | 2 | 3; // 0:上 1:右 2:下 3:左 (サブぷよが軸ぷよから見てどちらにあるか)

export interface FallingPair {
  pivotRow: number;
  pivotCol: number;
  rotation: Rotation;
  colors: [PuyoColor, PuyoColor]; // [0]=軸ぷよ色 [1]=サブぷよ色
  fallProgress: number; // 0..1、次の行へ落ちる進捗(描画補間用)
}

export type GamePhase = "falling" | "locking" | "clearing" | "gameover";

export interface World {
  board: Board;
  current: FallingPair | null; // clearing/gameover中はnull
  next: [PuyoColor, PuyoColor][]; // 常に長さ2 (NEXT, NEXT NEXT)
  phase: GamePhase;
  score: number;
  chain: number;
  lockTimer: number; // ms、locking中のみ有効
  clearTimer: number; // ms、clearing中のみ有効
  clearingCells: { row: number; col: number }[];
  fallSpeed: number; // 行/秒
  elapsedFrames: number;
  moveDir: -1 | 0 | 1; // 横移動DAS用の直近入力方向
  moveTimer: number; // ms、横移動オートリピートまでの残り時間
}

export const COLS = 6;
export const VISIBLE_ROWS = 12;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const MIN_MATCH = 4;
export const FRAME_MS = 1000 / 60;

export const BASE_FALL_SPEED = 1.0; // 行/秒
export const MAX_FALL_SPEED = 6.0;
export const SOFT_DROP_SPEED = 12.0;
export const SPEEDUP_INTERVAL_FRAMES = 60 * 15; // 約15秒毎に加速
export const SPEEDUP_STEP = 0.3;

export const LOCK_DELAY_MS = 400;
export const CLEAR_FLASH_MS = 350;
export const DAS_MS = 170;
export const ARR_MS = 60;

export const PUYO_COLORS: PuyoColor[] = ["red", "green", "blue", "yellow"];
export const PUYO_HEX: Record<PuyoColor, string> = {
  red: "#fb7185",
  green: "#4ade80",
  blue: "#38bdf8",
  yellow: "#fbbf24",
};

export const ROTATION_OFFSETS: Record<Rotation, { dRow: number; dCol: number }> = {
  0: { dRow: -1, dCol: 0 },
  1: { dRow: 0, dCol: 1 },
  2: { dRow: 1, dCol: 0 },
  3: { dRow: 0, dCol: -1 },
};

export function subCell(pair: FallingPair): { row: number; col: number } {
  const o = ROTATION_OFFSETS[pair.rotation];
  return { row: pair.pivotRow + o.dRow, col: pair.pivotCol + o.dCol };
}

export function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function randomColor(): PuyoColor {
  return PUYO_COLORS[Math.floor(Math.random() * PUYO_COLORS.length)];
}

export function randomColorPair(): [PuyoColor, PuyoColor] {
  return [randomColor(), randomColor()];
}

export function makeFallingPair(colors: [PuyoColor, PuyoColor], pivotCol: number): FallingPair {
  return { pivotRow: HIDDEN_ROWS - 1, pivotCol, rotation: 0, colors, fallProgress: 0 };
}

export function createWorld(): World {
  return {
    board: createEmptyBoard(),
    current: makeFallingPair(randomColorPair(), Math.floor(COLS / 2) - 1),
    next: [randomColorPair(), randomColorPair()],
    phase: "falling",
    score: 0,
    chain: 0,
    lockTimer: 0,
    clearTimer: 0,
    clearingCells: [],
    fallSpeed: BASE_FALL_SPEED,
    elapsedFrames: 0,
    moveDir: 0,
    moveTimer: 0,
  };
}
