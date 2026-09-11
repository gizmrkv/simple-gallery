import { Simulation } from "./simulation";
import type { SpatialGrid } from "./spatialGrid";

/** Draws the grid overlay (occupancy heatmap + gridlines) behind the circles. */
function drawGridOverlay(ctx: CanvasRenderingContext2D, grid: SpatialGrid): void {
  const cols = grid.cols;
  const rows = grid.rows;
  const size = grid.cellSizePx;
  const ox = grid.originX;
  const oy = grid.originY;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const occupancy = grid.occupancyAt(cy * cols + cx);
      if (occupancy <= 0) continue;
      const t = Math.min(1, Math.max(0, occupancy / 6));
      ctx.fillStyle = `rgba(51, 153, 255, ${0.12 + 0.4 * t})`;
      ctx.fillRect(ox + cx * size, oy + cy * size, size, size);
    }
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let cx = 0; cx <= cols; cx++) {
    const x = ox + cx * size;
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + rows * size);
  }
  for (let cy = 0; cy <= rows; cy++) {
    const y = oy + cy * size;
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + cols * size, y);
  }
  ctx.stroke();
}

/** Draws every circle as one of two Path2D fills (white / red), so a frame
 * with thousands of circles still costs only two `ctx.fill()` calls. */
function drawCircles(ctx: CanvasRenderingContext2D, sim: Simulation): void {
  const n = sim.count;
  const px = sim.positionsX;
  const py = sim.positionsY;
  const colliding = sim.colliding;
  const r = Simulation.RADIUS;

  const whitePath = new Path2D();
  const redPath = new Path2D();
  for (let i = 0; i < n; i++) {
    const path = colliding[i] ? redPath : whitePath;
    path.moveTo(px[i] + r, py[i]);
    path.arc(px[i], py[i], r, 0, Math.PI * 2);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fill(whitePath);
  ctx.fillStyle = "rgb(255, 51, 51)";
  ctx.fill(redPath);
}

export function render(ctx: CanvasRenderingContext2D, sim: Simulation, showGrid: boolean): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  if (showGrid) drawGridOverlay(ctx, sim.spatialGrid);
  drawCircles(ctx, sim);
}
