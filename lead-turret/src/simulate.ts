import { predictAimPoint } from './intercept';
import type { Vec2 } from './vec2';
import { add, length, limit, scale, sub } from './vec2';
import { PHYSICS, type World } from './world';

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

function updateTarget(world: World, inputDir: Vec2): void {
  const { target } = world;
  const prevVel = target.vel;

  if (target.mode === 'constant') {
    if (length(inputDir) > 0) {
      target.vel = scale(inputDir, PHYSICS.targetSpeed);
    }
    // 入力がなければ直前の速度を維持し、等速直線運動を続ける。
  } else {
    if (length(inputDir) > 0) {
      target.vel = limit(add(target.vel, scale(inputDir, PHYSICS.targetAccel)), PHYSICS.targetMaxSpeed);
    }
    // 入力がなければ摩擦なしで慣性のまま進む。
  }

  target.pos = {
    x: wrap(target.pos.x + target.vel.x, world.width),
    y: wrap(target.pos.y + target.vel.y, world.height),
  };
  target.prevVel = prevVel;
}

function updateBullets(world: World): void {
  const { target } = world;
  world.bullets = world.bullets.filter((bullet) => {
    bullet.pos = add(bullet.pos, bullet.vel);

    if (length(sub(bullet.pos, target.pos)) <= PHYSICS.hitRadius) {
      world.hits += 1;
      return false;
    }

    const margin = 20;
    if (
      bullet.pos.x < -margin ||
      bullet.pos.x > world.width + margin ||
      bullet.pos.y < -margin ||
      bullet.pos.y > world.height + margin
    ) {
      return false;
    }

    return true;
  });
}

function handleFiring(world: World): void {
  world.fireCooldown -= 1;
  if (world.fireCooldown > 0) return;
  world.fireCooldown = PHYSICS.fireInterval;

  const { target, turretPos } = world;
  const targetAccel = sub(target.vel, target.prevVel);
  const maxT = Math.max(world.width, world.height) / PHYSICS.bulletSpeed;
  const aimPoint = predictAimPoint(turretPos, target.pos, target.vel, targetAccel, PHYSICS.bulletSpeed, maxT);

  const dir = (() => {
    const toAim = sub(aimPoint, turretPos);
    const len = length(toAim);
    return len === 0 ? { x: 1, y: 0 } : scale(toAim, 1 / len);
  })();

  world.bullets.push({ pos: { ...turretPos }, vel: scale(dir, PHYSICS.bulletSpeed) });
  world.shotsFired += 1;
}

export function step(world: World, inputDir: Vec2): void {
  updateTarget(world, inputDir);
  updateBullets(world);
  handleFiring(world);
}
