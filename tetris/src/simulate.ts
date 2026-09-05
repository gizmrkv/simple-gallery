import type { InputState } from "./input";
import {
  ARR_MS,
  CLEAR_FLASH_MS,
  COLS,
  DAS_MS,
  FRAME_MS,
  HARD_DROP_POINT,
  HIDDEN_ROWS,
  KICK_OFFSETS,
  LINE_CLEAR_SCORE,
  LOCK_DELAY_MS,
  LOCK_RESET_LIMIT,
  NEXT_COUNT,
  ROWS,
  SOFT_DROP_POINT,
  SOFT_DROP_SPEED,
  canMove,
  canPlaceAt,
  cellsFor,
  fallSpeedForLevel,
  levelForLines,
  makeFallingPiece,
  shuffledBag,
} from "./world";
import type { Cell, Rotation, World } from "./world";

function tryRotate(world: World, dir: 1 | -1): boolean {
  const piece = world.current!;
  const newRotation = ((piece.rotation + dir + 4) % 4) as Rotation;

  for (const [dRow, dCol] of KICK_OFFSETS) {
    if (canPlaceAt(world.board, piece.originRow + dRow, piece.originCol + dCol, piece.type, newRotation)) {
      piece.originRow += dRow;
      piece.originCol += dCol;
      piece.rotation = newRotation;
      return true;
    }
  }
  return false;
}

function tryMovePiece(world: World, dCol: number): boolean {
  const piece = world.current!;
  if (!canMove(world.board, piece, 0, dCol)) return false;
  piece.originCol += dCol;
  return true;
}

function updateHorizontalMove(world: World, input: InputState): boolean {
  const dir = input.getHorizontalHeld();
  if (dir === 0) {
    world.moveDir = 0;
    return false;
  }
  if (dir !== world.moveDir) {
    world.moveDir = dir;
    world.moveTimer = DAS_MS;
    return tryMovePiece(world, dir);
  }
  world.moveTimer -= FRAME_MS;
  if (world.moveTimer <= 0) {
    world.moveTimer = ARR_MS;
    return tryMovePiece(world, dir);
  }
  return false;
}

function handleRotationInput(world: World, input: InputState): boolean {
  if (input.consumeRotateCw()) return tryRotate(world, 1);
  if (input.consumeRotateCcw()) return tryRotate(world, -1);
  return false;
}

function lockPieceIntoBoard(world: World): void {
  const piece = world.current!;
  for (const [row, col] of cellsFor(piece.type, piece.rotation, piece.originRow, piece.originCol)) {
    world.board[row][col] = piece.type;
  }
  world.current = null;
}

function hardDrop(world: World): void {
  const piece = world.current!;
  let dropped = 0;
  while (canMove(world.board, piece, 1, 0)) {
    piece.originRow += 1;
    dropped += 1;
  }
  piece.fallProgress = 0;
  world.score += dropped * HARD_DROP_POINT;
  lockPieceIntoBoard(world);
  resolveLines(world);
}

function spawnFromQueue(world: World): void {
  while (world.queue.length < NEXT_COUNT + 1) world.queue.push(...shuffledBag());
  const type = world.queue.shift()!;
  while (world.queue.length < NEXT_COUNT + 1) world.queue.push(...shuffledBag());

  const piece = makeFallingPiece(type);
  if (!canPlaceAt(world.board, piece.originRow, piece.originCol, piece.type, piece.rotation)) {
    world.current = null;
    world.phase = "gameover";
    return;
  }
  world.current = piece;
  world.canHold = true;
  world.phase = "falling";
}

function swapHold(world: World): void {
  const piece = world.current!;
  const type = piece.type;

  if (world.hold === null) {
    world.hold = type;
    spawnFromQueue(world);
  } else {
    const heldType = world.hold;
    world.hold = type;
    const next = makeFallingPiece(heldType);
    if (!canPlaceAt(world.board, next.originRow, next.originCol, next.type, next.rotation)) {
      world.current = null;
      world.phase = "gameover";
    } else {
      world.current = next;
      world.phase = "falling";
    }
  }
  world.canHold = false;
}

function resolveLines(world: World): void {
  const fullRows: number[] = [];
  for (let r = HIDDEN_ROWS; r < ROWS; r++) {
    if (world.board[r].every((cell) => cell !== null)) fullRows.push(r);
  }

  if (fullRows.length === 0) {
    spawnFromQueue(world);
    return;
  }

  world.clearingRows = fullRows;
  world.clearTimer = CLEAR_FLASH_MS;
  const clearedCount = fullRows.length as 1 | 2 | 3 | 4;
  world.score += LINE_CLEAR_SCORE[clearedCount] * world.level;
  world.linesCleared += fullRows.length;
  world.level = levelForLines(world.linesCleared);
  world.fallSpeed = fallSpeedForLevel(world.level);
  world.phase = "clearing";
}

function resolveClearingStep(world: World): void {
  world.clearTimer -= FRAME_MS;
  if (world.clearTimer > 0) return;

  const clearedSet = new Set(world.clearingRows);
  const remaining = world.board.filter((_, r) => !clearedSet.has(r));
  const removedCount = world.board.length - remaining.length;
  const emptyRows = Array.from({ length: removedCount }, () => Array<Cell>(COLS).fill(null));
  world.board = [...emptyRows, ...remaining];
  world.clearingRows = [];
  spawnFromQueue(world);
}

function stepFalling(world: World, input: InputState): void {
  const piece = world.current!;

  if (input.consumeHold()) {
    if (world.canHold) swapHold(world);
    return;
  }

  updateHorizontalMove(world, input);
  handleRotationInput(world, input);

  if (input.consumeHardDropPress()) {
    hardDrop(world);
    return;
  }

  const softDrop = input.isSoftDropHeld();
  const speed = softDrop ? Math.max(world.fallSpeed, SOFT_DROP_SPEED) : world.fallSpeed;
  piece.fallProgress += speed * (FRAME_MS / 1000);
  while (piece.fallProgress >= 1) {
    if (canMove(world.board, piece, 1, 0)) {
      piece.originRow += 1;
      piece.fallProgress -= 1;
      if (softDrop) world.score += SOFT_DROP_POINT;
    } else {
      piece.fallProgress = 0;
      break;
    }
  }

  if (!canMove(world.board, piece, 1, 0)) {
    world.phase = "locking";
    world.lockTimer = LOCK_DELAY_MS;
    world.lockResets = 0;
  }
}

function stepLocking(world: World, input: InputState): void {
  const piece = world.current!;

  if (input.consumeHold()) {
    if (world.canHold) swapHold(world);
    return;
  }

  const moved = updateHorizontalMove(world, input);
  const rotated = handleRotationInput(world, input);

  if (input.consumeHardDropPress()) {
    hardDrop(world);
    return;
  }

  if (canMove(world.board, piece, 1, 0)) {
    world.phase = "falling"; // 動いた結果、支えを失った(段差から滑り落ちた等)
    return;
  }
  if ((moved || rotated) && world.lockResets < LOCK_RESET_LIMIT) {
    world.lockTimer = LOCK_DELAY_MS;
    world.lockResets += 1;
  }

  world.lockTimer -= FRAME_MS;
  if (world.lockTimer <= 0) {
    lockPieceIntoBoard(world);
    resolveLines(world);
  }
}

export function step(world: World, input: InputState): void {
  if (world.phase === "gameover") return;

  world.elapsedFrames += 1;

  switch (world.phase) {
    case "falling":
      stepFalling(world, input);
      break;
    case "locking":
      stepLocking(world, input);
      break;
    case "clearing":
      resolveClearingStep(world);
      break;
  }
}
