import { COLS, HIDDEN_ROWS, NEXT_COUNT, PIECE_HEX, PIECE_SHAPES, VISIBLE_ROWS, canPlaceAt, cellsFor } from "./world";
import type { Board, PieceType, World } from "./world";

const CELL = 28;
const BOARD_X = 132;
const BOARD_Y = 48;
const BOARD_W = COLS * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;
const HOLD_X = 24;
const HOLD_Y = BOARD_Y;
const HOLD_SIZE = 88;
const SIDEBAR_X = BOARD_X + BOARD_W + 40;
const NEXT_BOX_SIZE = 76;

export const CANVAS_W = SIDEBAR_X + NEXT_BOX_SIZE + 24;
export const CANVAS_H = BOARD_Y + BOARD_H + 24;

function boardToScreen(row: number, col: number): { cx: number; cy: number } {
  return {
    cx: BOARD_X + col * CELL + CELL / 2,
    cy: BOARD_Y + (row - HIDDEN_ROWS) * CELL + CELL / 2,
  };
}

function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, hex: string, glow = 14, size = CELL - 4): void {
  ctx.save();
  ctx.shadowBlur = glow;
  ctx.shadowColor = hex;
  ctx.fillStyle = hex;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function drawMiniPiece(ctx: CanvasRenderingContext2D, type: PieceType, boxX: number, boxY: number, boxSize: number, glow = 10, alpha = 1): void {
  const shape = PIECE_SHAPES[type][0];
  const rows = shape.map(([r]) => r);
  const cols = shape.map(([, c]) => c);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  const width = Math.max(...cols) - minCol + 1;
  const height = Math.max(...rows) - minRow + 1;
  const cellSize = Math.min((boxSize - 16) / Math.max(width, height), 20);
  const startX = boxX + (boxSize - width * cellSize) / 2;
  const startY = boxY + (boxSize - height * cellSize) / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [r, c] of shape) {
    const cx = startX + (c - minCol) * cellSize + cellSize / 2;
    const cy = startY + (r - minRow) * cellSize + cellSize / 2;
    drawCell(ctx, cx, cy, PIECE_HEX[type], glow, cellSize - 4);
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, "#05060f");
  grad.addColorStop(1, "#0d1626");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawBoardPanel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#0a0f1c";
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#22d3ee";
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
  ctx.restore();

  ctx.strokeStyle = "rgba(120,160,220,0.08)";
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    const x = BOARD_X + c * CELL;
    ctx.beginPath();
    ctx.moveTo(x, BOARD_Y);
    ctx.lineTo(x, BOARD_Y + BOARD_H);
    ctx.stroke();
  }
  for (let r = 1; r < VISIBLE_ROWS; r++) {
    const y = BOARD_Y + r * CELL;
    ctx.beginPath();
    ctx.moveTo(BOARD_X, y);
    ctx.lineTo(BOARD_X + BOARD_W, y);
    ctx.stroke();
  }
}

function drawFixedCells(ctx: CanvasRenderingContext2D, board: Board, clearingRows: number[]): void {
  const clearingSet = new Set(clearingRows);
  for (let r = HIDDEN_ROWS; r < board.length; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = board[r][c];
      if (!type) continue;
      const { cx, cy } = boardToScreen(r, c);
      if (clearingSet.has(r)) {
        const flash = (Math.sin(performance.now() / 50) + 1) / 2;
        drawCell(ctx, cx, cy, PIECE_HEX[type], 12 + flash * 24);
        ctx.save();
        ctx.globalAlpha = 0.6 * flash;
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(cx - (CELL - 4) / 2, cy - (CELL - 4) / 2, CELL - 4, CELL - 4);
        ctx.restore();
      } else {
        drawCell(ctx, cx, cy, PIECE_HEX[type]);
      }
    }
  }
}

function ghostOriginRow(board: Board, world: World): number {
  const piece = world.current!;
  let row = piece.originRow;
  while (canPlaceAt(board, row + 1, piece.originCol, piece.type, piece.rotation)) row += 1;
  return row;
}

function drawGhost(ctx: CanvasRenderingContext2D, world: World): void {
  const piece = world.current;
  if (!piece) return;
  const ghostRow = ghostOriginRow(world.board, world);
  if (ghostRow === piece.originRow) return;

  ctx.save();
  ctx.globalAlpha = 0.25;
  for (const [row, col] of cellsFor(piece.type, piece.rotation, ghostRow, piece.originCol)) {
    const { cx, cy } = boardToScreen(row, col);
    ctx.fillStyle = PIECE_HEX[piece.type];
    ctx.fillRect(cx - (CELL - 4) / 2, cy - (CELL - 4) / 2, CELL - 4, CELL - 4);
  }
  ctx.restore();
}

function drawFallingPiece(ctx: CanvasRenderingContext2D, world: World): void {
  const piece = world.current;
  if (!piece) return;
  for (const [row, col] of cellsFor(piece.type, piece.rotation, piece.originRow + piece.fallProgress, piece.originCol)) {
    const { cx, cy } = boardToScreen(row, col);
    drawCell(ctx, cx, cy, PIECE_HEX[piece.type]);
  }
}

function drawHoldBox(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.save();
  ctx.font = "13px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("HOLD", HOLD_X, HOLD_Y - 8);
  ctx.restore();

  ctx.fillStyle = "#0a0f1c";
  ctx.fillRect(HOLD_X, HOLD_Y, HOLD_SIZE, HOLD_SIZE);
  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(HOLD_X, HOLD_Y, HOLD_SIZE, HOLD_SIZE);

  if (world.hold) drawMiniPiece(ctx, world.hold, HOLD_X, HOLD_Y, HOLD_SIZE, 10, world.canHold ? 1 : 0.35);
}

function drawNextBoxes(ctx: CanvasRenderingContext2D, world: World): number {
  ctx.save();
  ctx.font = "13px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("NEXT", SIDEBAR_X, BOARD_Y - 8);
  ctx.restore();

  const preview = world.queue.slice(0, NEXT_COUNT);
  for (let i = 0; i < preview.length; i++) {
    const boxY = BOARD_Y + i * (NEXT_BOX_SIZE + 12);
    ctx.fillStyle = "#0a0f1c";
    ctx.fillRect(SIDEBAR_X, boxY, NEXT_BOX_SIZE, NEXT_BOX_SIZE);
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(SIDEBAR_X, boxY, NEXT_BOX_SIZE, NEXT_BOX_SIZE);
    drawMiniPiece(ctx, preview[i], SIDEBAR_X, boxY, NEXT_BOX_SIZE, i === 0 ? 12 : 6);
  }
  return BOARD_Y + preview.length * (NEXT_BOX_SIZE + 12);
}

function drawStatsText(ctx: CanvasRenderingContext2D, world: World, statsY: number): void {
  const rows: [string, string][] = [
    ["SCORE", String(world.score)],
    ["LEVEL", String(world.level)],
    ["LINES", String(world.linesCleared)],
  ];
  rows.forEach(([label, value], i) => {
    const y = statsY + 20 + i * 54;
    ctx.save();
    ctx.font = "12px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "#64748b";
    ctx.fillText(label, SIDEBAR_X, y);
    ctx.font = "bold 22px ui-monospace, Consolas, monospace";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#22d3ee";
    ctx.fillStyle = "#67e8f9";
    ctx.fillText(value, SIDEBAR_X, y + 26);
    ctx.restore();
  });
}

function drawGameOver(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = "rgba(5,6,15,0.72)";
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
  ctx.font = "bold 22px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.shadowBlur = 20;
  ctx.shadowColor = "#f472b6";
  ctx.fillStyle = "#f9a8d4";
  ctx.fillText("GAME OVER", BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2);
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  drawBackground(ctx);
  drawBoardPanel(ctx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
  ctx.clip();
  drawFixedCells(ctx, world.board, world.clearingRows);
  drawGhost(ctx, world);
  drawFallingPiece(ctx, world);
  ctx.restore();

  if (world.phase === "gameover") drawGameOver(ctx);

  drawHoldBox(ctx, world);
  const statsY = drawNextBoxes(ctx, world);
  drawStatsText(ctx, world, statsY);
}
