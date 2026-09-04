import type { Vec2 } from './vec2';
import { zero } from './vec2';

export type MotionMode = 'constant' | 'accelerated';

export interface Target {
  pos: Vec2;
  vel: Vec2;
  prevVel: Vec2;
  mode: MotionMode;
}

export interface Bullet {
  pos: Vec2;
  vel: Vec2;
}

export interface World {
  width: number;
  height: number;
  turretPos: Vec2;
  target: Target;
  bullets: Bullet[];
  fireCooldown: number;
  shotsFired: number;
  hits: number;
}

// 速度は「1tickあたりの移動量(px/tick)」として扱う。dtを陽に掛けない規約
// (simple-boids-likeと同じ)。
export const PHYSICS = {
  targetSpeed: 3.2, // 等速モードでの移動速度
  targetAccel: 0.18, // 加速度モードでの加速度
  targetMaxSpeed: 4.5, // 加速度モードでの速度上限
  bulletSpeed: 9, // 弾速。目標の最大速度より十分速くないと偏差射撃が解を持たない
  fireInterval: 45, // 発砲間隔(tick)。60fps想定で約0.75秒
  hitRadius: 8, // この距離以内に弾が来たら命中とみなす
} as const;

export function createWorld(width: number, height: number): World {
  return {
    width,
    height,
    turretPos: { x: width / 2, y: height / 2 },
    target: {
      pos: { x: width * 0.2, y: height * 0.2 },
      vel: zero(),
      prevVel: zero(),
      mode: 'constant',
    },
    bullets: [],
    fireCooldown: PHYSICS.fireInterval,
    shotsFired: 0,
    hits: 0,
  };
}
