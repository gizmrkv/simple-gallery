import type { World } from "./world";

const GRID_SPACING = 80;

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  const { canvasWidth: w, canvasHeight: h } = world;

  // 背景(画面空間): ダークグラデーション
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#05060f");
  sky.addColorStop(1, "#0d1a2b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // パララックスグリッド(画面空間、遠景として世界より遅くスクロール)
  ctx.strokeStyle = "rgba(120, 160, 220, 0.08)";
  ctx.lineWidth = 1;
  const offset = -(world.cameraX * 0.3) % GRID_SPACING;
  for (let x = offset; x < w; x += GRID_SPACING) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 世界空間レイヤー
  ctx.save();
  ctx.translate(-world.cameraX, 0);

  for (const platform of world.platforms) {
    ctx.fillStyle = "#12182b";
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#22d3ee";
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
    ctx.restore();
  }

  // ゴールの旗
  const { goal } = world;
  ctx.save();
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#e2e8f0";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(goal.x, goal.y + goal.height);
  ctx.lineTo(goal.x, goal.y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowBlur = 16 + Math.sin(performance.now() / 200) * 4;
  ctx.shadowColor = "#fbbf24";
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(goal.x, goal.y);
  ctx.lineTo(goal.x + goal.width, goal.y + goal.height * 0.25);
  ctx.lineTo(goal.x, goal.y + goal.height * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // プレイヤーのトレイル
  for (let i = 0; i < world.trail.length; i++) {
    const p = world.trail[i];
    const alpha = ((i + 1) / world.trail.length) * 0.25;
    ctx.fillStyle = `rgba(244, 114, 182, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // プレイヤー
  const { player } = world;
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = "#f472b6";
  ctx.fillStyle = "#f472b6";
  const r = 8;
  ctx.beginPath();
  ctx.roundRect(player.pos.x, player.pos.y, player.width, player.height, r);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // クリア時オーバーレイ(画面空間)
  if (world.status === "cleared") {
    ctx.fillStyle = "rgba(5, 6, 15, 0.75)";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = "#22d3ee";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CLEAR", w / 2, h / 2);
    ctx.restore();
  }
}
