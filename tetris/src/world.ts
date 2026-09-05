export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Cell = PieceType | null;
export type Board = Cell[][]; // board[row][col], row 0 = 最上段(隠し行)

export type Rotation = 0 | 1 | 2 | 3; // 0:spawn 1:右 2:180 3:左

export interface FallingPiece {
  type: PieceType;
  rotation: Rotation;
  originRow: number;
  originCol: number;
  fallProgress: number; // 0..1、次の行へ落ちる進捗(描画補間用)
}

export type GamePhase = "falling" | "locking" | "clearing" | "gameover";

export interface World {
  board: Board;
  current: FallingPiece | null; // clearing/gameover中はnull
  queue: PieceType[]; // 7-bagのコンベア。queue[0..NEXT_COUNT-1]がネクスト表示
  hold: PieceType | null;
  canHold: boolean;
  phase: GamePhase;
  score: number;
  level: number;
  linesCleared: number;
  lockTimer: number; // ms、locking中のみ有効
  lockResets: number; // locking中の移動/回転によるリセット回数(上限あり)
  clearTimer: number; // ms、clearing中のみ有効
  clearingRows: number[];
  fallSpeed: number; // 行/秒
  elapsedFrames: number;
  moveDir: -1 | 0 | 1; // 横移動DAS用の直近入力方向
  moveTimer: number; // ms、横移動オートリピートまでの残り時間
}

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 4;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const NEXT_COUNT = 3;
export const FRAME_MS = 1000 / 60;

export const BASE_FALL_SPEED = 1.0; // 行/秒
export const FALL_SPEED_STEP = 0.5;
export const MAX_FALL_SPEED = 20.0;
export const SOFT_DROP_SPEED = 20.0;

export const LOCK_DELAY_MS = 500;
export const LOCK_RESET_LIMIT = 15;
export const CLEAR_FLASH_MS = 300;
export const DAS_MS = 170;
export const ARR_MS = 60;

export const LINES_PER_LEVEL = 10;
export const LINE_CLEAR_SCORE: Record<1 | 2 | 3 | 4, number> = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const SOFT_DROP_POINT = 1;
export const HARD_DROP_POINT = 2;

export const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export const PIECE_HEX: Record<PieceType, string> = {
  I: "#22d3ee",
  O: "#fde047",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#fb7185",
  J: "#60a5fa",
  L: "#fb923c",
};

// 各ピース×回転状態(0:spawn 1:右 2:180 3:左)ごとの4セルオフセット[dRow, dCol]。
// 標準的なテトリスガイドラインの回転形状(SRS)をそのまま表として持つ。
export const PIECE_SHAPES: Record<PieceType, Record<Rotation, [number, number][]>> = {
  I: {
    0: [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
    1: [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    2: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    3: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  O: {
    0: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    1: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    2: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    3: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  T: {
    0: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    1: [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 1],
    ],
    2: [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 1],
    ],
    3: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
  S: {
    0: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    1: [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    2: [
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
    ],
    3: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
  Z: {
    0: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
    1: [
      [0, 2],
      [1, 1],
      [1, 2],
      [2, 1],
    ],
    2: [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    3: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
    ],
  },
  J: {
    0: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    1: [
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
    ],
    2: [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    3: [
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
  },
  L: {
    0: [
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    1: [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    2: [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ],
    3: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
};

// 回転時に順番に試す壁蹴りオフセット[dRow, dCol]。公式SRSの回転ペア毎の
// 正確なテーブルではなく、「その場→左右1マス→左右2マス(縦I用)→1マス上→
// 上+斜め」を一律で試す簡易実装。
export const KICK_OFFSETS: [number, number][] = [
  [0, 0],
  [0, -1],
  [0, 1],
  [0, -2],
  [0, 2],
  [-1, 0],
  [-1, -1],
  [-1, 1],
];

export function cellsFor(type: PieceType, rotation: Rotation, originRow: number, originCol: number): [number, number][] {
  return PIECE_SHAPES[type][rotation].map(([dRow, dCol]) => [originRow + dRow, originCol + dCol]);
}

export function isCellFree(board: Board, row: number, col: number): boolean {
  if (col < 0 || col >= COLS || row >= ROWS) return false;
  if (row < 0) return true; // 盤面より上(出現直後の一瞬だけ想定)
  return board[row][col] === null;
}

export function canPlaceAt(board: Board, originRow: number, originCol: number, type: PieceType, rotation: Rotation): boolean {
  return cellsFor(type, rotation, originRow, originCol).every(([row, col]) => isCellFree(board, row, col));
}

export function canMove(board: Board, piece: FallingPiece, dRow: number, dCol: number): boolean {
  return canPlaceAt(board, piece.originRow + dRow, piece.originCol + dCol, piece.type, piece.rotation);
}

export function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function shuffledBag(): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function fallSpeedForLevel(level: number): number {
  return Math.min(MAX_FALL_SPEED, BASE_FALL_SPEED + (level - 1) * FALL_SPEED_STEP);
}

export function levelForLines(linesCleared: number): number {
  return Math.floor(linesCleared / LINES_PER_LEVEL) + 1;
}

export function makeFallingPiece(type: PieceType): FallingPiece {
  return {
    type,
    rotation: 0,
    originRow: HIDDEN_ROWS - 2,
    originCol: Math.floor(COLS / 2) - 2,
    fallProgress: 0,
  };
}

export function createWorld(): World {
  const queue = [...shuffledBag(), ...shuffledBag()];
  const type = queue.shift()!;
  return {
    board: createEmptyBoard(),
    current: makeFallingPiece(type),
    queue,
    hold: null,
    canHold: true,
    phase: "falling",
    score: 0,
    level: 1,
    linesCleared: 0,
    lockTimer: 0,
    lockResets: 0,
    clearTimer: 0,
    clearingRows: [],
    fallSpeed: BASE_FALL_SPEED,
    elapsedFrames: 0,
    moveDir: 0,
    moveTimer: 0,
  };
}
