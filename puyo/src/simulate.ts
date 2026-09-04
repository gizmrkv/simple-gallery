import type { InputState } from "./input";
import {
  ARR_MS,
  BASE_FALL_SPEED,
  COLS,
  CLEAR_FLASH_MS,
  DAS_MS,
  FRAME_MS,
  LOCK_DELAY_MS,
  MAX_FALL_SPEED,
  MIN_MATCH,
  ROTATION_OFFSETS,
  ROWS,
  SOFT_DROP_SPEED,
  SPEEDUP_INTERVAL_FRAMES,
  SPEEDUP_STEP,
  makeFallingPair,
  randomColorPair,
  subCell,
} from "./world";
import type { Board, FallingPair, PuyoColor, Rotation, World } from "./world";

function isCellFree(board: Board, row: number, col: number): boolean {
  if (col < 0 || col >= COLS || row >= ROWS) return false;
  if (row < 0) return true; // 盤面より上(出現直後の一瞬だけ想定)
  return board[row][col] === null;
}

function canPlacePairAt(board: Board, pivotRow: number, pivotCol: number, rotation: Rotation): boolean {
  const o = ROTATION_OFFSETS[rotation];
  return isCellFree(board, pivotRow, pivotCol) && isCellFree(board, pivotRow + o.dRow, pivotCol + o.dCol);
}

function canMove(board: Board, pair: FallingPair, dRow: number, dCol: number): boolean {
  return canPlacePairAt(board, pair.pivotRow + dRow, pair.pivotCol + dCol, pair.rotation);
}

function tryRotate(world: World, dir: 1 | -1): boolean {
  const pair = world.current!;
  const newRotation = ((pair.rotation + dir + 4) % 4) as Rotation;

  if (canPlacePairAt(world.board, pair.pivotRow, pair.pivotCol, newRotation)) {
    pair.rotation = newRotation;
    return true;
  }

  const newOffset = ROTATION_OFFSETS[newRotation];
  const wouldBeSubCol = pair.pivotCol + newOffset.dCol;
  const kickDir = wouldBeSubCol < pair.pivotCol ? 1 : wouldBeSubCol > pair.pivotCol ? -1 : 0;
  if (kickDir !== 0 && canPlacePairAt(world.board, pair.pivotRow, pair.pivotCol + kickDir, newRotation)) {
    pair.pivotCol += kickDir;
    pair.rotation = newRotation;
    return true;
  }

  if (newOffset.dRow > 0 && canPlacePairAt(world.board, pair.pivotRow - 1, pair.pivotCol, newRotation)) {
    pair.pivotRow -= 1;
    pair.rotation = newRotation;
    return true;
  }

  return false;
}

function tryMovePair(world: World, dCol: number): boolean {
  const pair = world.current!;
  if (!canMove(world.board, pair, 0, dCol)) return false;
  pair.pivotCol += dCol;
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
    return tryMovePair(world, dir);
  }
  world.moveTimer -= FRAME_MS;
  if (world.moveTimer <= 0) {
    world.moveTimer = ARR_MS;
    return tryMovePair(world, dir);
  }
  return false;
}

function handleRotationInput(world: World, input: InputState): boolean {
  if (input.consumeRotateCw()) return tryRotate(world, 1);
  if (input.consumeRotateCcw()) return tryRotate(world, -1);
  return false;
}

function lockPairIntoBoard(world: World): void {
  const pair = world.current!;
  const sub = subCell(pair);
  world.board[pair.pivotRow][pair.pivotCol] = pair.colors[0];
  world.board[sub.row][sub.col] = pair.colors[1];
  world.current = null;
}

function hardDrop(world: World): void {
  const pair = world.current!;
  while (canMove(world.board, pair, 1, 0)) pair.pivotRow += 1;
  pair.fallProgress = 0;
  lockPairIntoBoard(world);
  startResolve(world);
}

function spawnNext(world: World): void {
  const colors = world.next.shift()!;
  world.next.push(randomColorPair());
  const pivotCol = Math.floor(COLS / 2) - 1;
  const pair = makeFallingPair(colors, pivotCol);
  if (!canPlacePairAt(world.board, pair.pivotRow, pair.pivotCol, pair.rotation)) {
    world.current = null;
    world.phase = "gameover";
    return;
  }
  world.current = pair;
  world.phase = "falling";
}

function findMatches(board: Board): { row: number; col: number }[] {
  const visited = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const matched: { row: number; col: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null || visited[r][c]) continue;
      const color: PuyoColor = board[r][c]!;
      const group: { row: number; col: number }[] = [];
      const stack = [{ row: r, col: c }];
      visited[r][c] = true;
      while (stack.length > 0) {
        const cell = stack.pop()!;
        group.push(cell);
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nr = cell.row + dr;
          const nc = cell.col + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          if (visited[nr][nc] || board[nr][nc] !== color) continue;
          visited[nr][nc] = true;
          stack.push({ row: nr, col: nc });
        }
      }
      if (group.length >= MIN_MATCH) matched.push(...group);
    }
  }
  return matched;
}

function applyGravity(board: Board): void {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        if (write !== r) {
          board[write][c] = board[r][c];
          board[r][c] = null;
        }
        write--;
      }
    }
  }
}

const CHAIN_MULTIPLIERS = [1, 2, 4, 8, 16, 32]; // 6連鎖以降は32倍で頭打ち

function scoreForClear(clearedCount: number, chain: number): number {
  const mult = CHAIN_MULTIPLIERS[Math.min(chain - 1, CHAIN_MULTIPLIERS.length - 1)];
  return clearedCount * 10 * mult;
}

function startResolve(world: World): void {
  const matches = findMatches(world.board);
  if (matches.length === 0) {
    world.chain = 0;
    spawnNext(world);
    return;
  }
  world.chain += 1;
  world.clearingCells = matches;
  world.clearTimer = CLEAR_FLASH_MS;
  world.score += scoreForClear(matches.length, world.chain);
  world.phase = "clearing";
}

function resolveClearingStep(world: World): void {
  world.clearTimer -= FRAME_MS;
  if (world.clearTimer > 0) return;
  for (const { row, col } of world.clearingCells) world.board[row][col] = null;
  world.clearingCells = [];
  applyGravity(world.board);
  startResolve(world);
}

function stepFalling(world: World, input: InputState): void {
  const pair = world.current!;
  updateHorizontalMove(world, input);
  handleRotationInput(world, input);

  if (input.consumeHardDropPress()) {
    hardDrop(world);
    return;
  }

  const speed = input.isSoftDropHeld() ? Math.max(world.fallSpeed, SOFT_DROP_SPEED) : world.fallSpeed;
  pair.fallProgress += speed * (FRAME_MS / 1000);
  while (pair.fallProgress >= 1) {
    if (canMove(world.board, pair, 1, 0)) {
      pair.pivotRow += 1;
      pair.fallProgress -= 1;
    } else {
      pair.fallProgress = 0;
      break;
    }
  }

  if (!canMove(world.board, pair, 1, 0)) {
    world.phase = "locking";
    world.lockTimer = LOCK_DELAY_MS;
  }
}

function stepLocking(world: World, input: InputState): void {
  const pair = world.current!;
  const moved = updateHorizontalMove(world, input);
  const rotated = handleRotationInput(world, input);

  if (input.consumeHardDropPress()) {
    hardDrop(world);
    return;
  }

  if (canMove(world.board, pair, 1, 0)) {
    world.phase = "falling"; // 動いた結果、支えを失った(段差から滑り落ちた等)
    return;
  }
  if (moved || rotated) world.lockTimer = LOCK_DELAY_MS; // 接地中でも動けたらロック延長

  world.lockTimer -= FRAME_MS;
  if (world.lockTimer <= 0) {
    lockPairIntoBoard(world);
    startResolve(world);
  }
}

export function step(world: World, input: InputState): void {
  if (world.phase === "gameover") return;

  world.elapsedFrames += 1;
  world.fallSpeed = Math.min(
    MAX_FALL_SPEED,
    BASE_FALL_SPEED + Math.floor(world.elapsedFrames / SPEEDUP_INTERVAL_FRAMES) * SPEEDUP_STEP,
  );

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
