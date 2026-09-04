import { COLS, HIDDEN_ROWS, PUYO_HEX, VISIBLE_ROWS, subCell } from "./world";
import type { Board, PuyoColor, World } from "./world";

export const CANVAS_W = 640;
export const CANVAS_H = 600;
const CELL = 42;
const BOARD_X = 32;
const BOARD_Y = 48;
const BOARD_W = COLS * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;
const SIDEBAR_X = BOARD_X + BOARD_W + 40;

function boardToScreen(row: number, col: number): { cx: number; cy: number } {
  return {
    cx: BOARD_X + col * CELL + CELL / 2,
    cy: BOARD_Y + (row - HIDDEN_ROWS) * CELL + CELL / 2,
  };
}

function drawPuyo(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: PuyoColor, glow = 18, radius = CELL / 2 - 4): void {
  const hex = PUYO_HEX[color];
  ctx.save();
  ctx.shadowBlur = glow;
  ctx.shadowColor = hex;
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
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

function drawFixedPuyos(ctx: CanvasRenderingContext2D, board: Board, clearingCells: { row: number; col: number }[]): void {
  const clearingSet = new Set(clearingCells.map(({ row, col }) => `${row},${col}`));
  for (let r = HIDDEN_ROWS; r < board.length; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = board[r][c];
      if (!color) continue;
      const { cx, cy } = boardToScreen(r, c);
      if (clearingSet.has(`${r},${c}`)) {
        const flash = (Math.sin(performance.now() / 50) + 1) / 2;
        drawPuyo(ctx, cx, cy, color, 12 + flash * 24);
        ctx.save();
        ctx.globalAlpha = 0.6 * flash;
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        drawPuyo(ctx, cx, cy, color);
      }
    }
  }
}

function drawFallingPair(ctx: CanvasRenderingContext2D, world: World): void {
  const pair = world.current;
  if (!pair) return;
  const sub = subCell(pair);
  const pivotScreen = boardToScreen(pair.pivotRow + pair.fallProgress, pair.pivotCol);
  const subScreen = boardToScreen(sub.row + pair.fallProgress, sub.col);
  drawPuyo(ctx, pivotScreen.cx, pivotScreen.cy, pair.colors[0]);
  drawPuyo(ctx, subScreen.cx, subScreen.cy, pair.colors[1]);
}

function drawSidebar(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.save();
  ctx.font = "13px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("NEXT", SIDEBAR_X, BOARD_Y);
  ctx.restore();

  const nextBoxSize = 76;
  for (let i = 0; i < world.next.length; i++) {
    const boxY = BOARD_Y + 12 + i * (nextBoxSize + 12);
    ctx.fillStyle = "#0a0f1c";
    ctx.fillRect(SIDEBAR_X, boxY, nextBoxSize, nextBoxSize);
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(SIDEBAR_X, boxY, nextBoxSize, nextBoxSize);

    const [colorA, colorB] = world.next[i];
    const radius = i === 0 ? 14 : 10;
    const cx = SIDEBAR_X + nextBoxSize / 2;
    drawPuyo(ctx, cx, boxY + nextBoxSize / 2 - radius - 2, colorA, i === 0 ? 12 : 6, radius);
    drawPuyo(ctx, cx, boxY + nextBoxSize / 2 + radius + 2, colorB, i === 0 ? 12 : 6, radius);
  }

  const statsY = BOARD_Y + 12 + world.next.length * (nextBoxSize + 12) + 20;

  ctx.save();
  ctx.font = "12px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#64748b";
  ctx.fillText("SCORE", SIDEBAR_X, statsY);
  ctx.font = "bold 22px ui-monospace, Consolas, monospace";
  ctx.shadowBlur = 10;
  ctx.shadowColor = "#22d3ee";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText(String(world.score), SIDEBAR_X, statsY + 26);
  ctx.restore();

  ctx.save();
  ctx.font = "12px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "#64748b";
  ctx.fillText("CHAIN", SIDEBAR_X, statsY + 54);
  ctx.font = "bold 22px ui-monospace, Consolas, monospace";
  if (world.chain > 1) {
    ctx.shadowBlur = 14;
    ctx.shadowColor = "#f472b6";
    ctx.fillStyle = "#f9a8d4";
  } else {
    ctx.fillStyle = "#94a3b8";
  }
  ctx.fillText(String(world.chain), SIDEBAR_X, statsY + 80);
  ctx.restore();
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
  drawFixedPuyos(ctx, world.board, world.clearingCells);
  drawFallingPair(ctx, world);
  ctx.restore();

  if (world.phase === "gameover") drawGameOver(ctx);

  drawSidebar(ctx, world);
}
