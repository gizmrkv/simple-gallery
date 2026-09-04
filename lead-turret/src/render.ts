import type { Vec2 } from './vec2';
import { add, normalize, scale } from './vec2';
import type { World } from './world';

export function render(ctx: CanvasRenderingContext2D, world: World, debugAimPoint: Vec2 | null): void {
  const { target, turretPos } = world;
  ctx.clearRect(0, 0, world.width, world.height);

  // 砲台
  ctx.fillStyle = '#adb5bd';
  ctx.beginPath();
  ctx.arc(turretPos.x, turretPos.y, 10, 0, Math.PI * 2);
  ctx.fill();

  // 弾
  ctx.fillStyle = '#ffd43b';
  for (const bullet of world.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.pos.x, bullet.pos.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // デバッグ: 予測着弾点
  if (debugAimPoint) {
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.7)';
    ctx.lineWidth = 2;
    const r = 7;
    ctx.beginPath();
    ctx.moveTo(debugAimPoint.x - r, debugAimPoint.y - r);
    ctx.lineTo(debugAimPoint.x + r, debugAimPoint.y + r);
    ctx.moveTo(debugAimPoint.x + r, debugAimPoint.y - r);
    ctx.lineTo(debugAimPoint.x - r, debugAimPoint.y + r);
    ctx.stroke();
  }

  // 目標の速度ベクトル
  const dirLen = 24;
  const dir = normalize(target.vel);
  if (dir.x !== 0 || dir.y !== 0) {
    const tip = add(target.pos, scale(dir, dirLen));
    ctx.strokeStyle = 'rgba(77, 171, 247, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(target.pos.x, target.pos.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }

  // 目標
  ctx.fillStyle = target.mode === 'accelerated' ? '#ff922b' : '#4dabf7';
  ctx.beginPath();
  ctx.arc(target.pos.x, target.pos.y, 7, 0, Math.PI * 2);
  ctx.fill();
}
