import type { Vec2 } from './vec2';
import { add, length, scale, sub } from './vec2';

const MAX_ITERATIONS = 10;
const CONVERGENCE_EPS = 1e-3;

function positionAt(pos: Vec2, vel: Vec2, accel: Vec2, t: number): Vec2 {
  return add(add(pos, scale(vel, t)), scale(accel, 0.5 * t * t));
}

// 着弾時刻tを不動点反復で求める: t = |目標のt秒後の予測位置 - 砲台位置| / 弾速。
// 等速(accel=0)でも加速度ありでも同じ式で扱える。弾が目標に追いつけない
// (弾速 <= 目標の実効速度)場合は収束せずtが際限なく伸びるため、maxT でクランプする。
export function predictAimPoint(
  turretPos: Vec2,
  targetPos: Vec2,
  targetVel: Vec2,
  targetAccel: Vec2,
  bulletSpeed: number,
  maxT: number,
): Vec2 {
  let t = length(sub(targetPos, turretPos)) / bulletSpeed;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const predicted = positionAt(targetPos, targetVel, targetAccel, t);
    const nextT = Math.min(length(sub(predicted, turretPos)) / bulletSpeed, maxT);
    if (Math.abs(nextT - t) < CONVERGENCE_EPS) {
      t = nextT;
      break;
    }
    t = nextT;
  }
  return positionAt(targetPos, targetVel, targetAccel, t);
}
