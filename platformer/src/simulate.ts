import type { InputState } from "./input";
import { zero } from "./vec2";
import { PHYSICS, TRAIL_MAX_LENGTH, type World } from "./world";

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

export function step(world: World, input: InputState): void {
  if (world.status === "cleared") return;

  const { player } = world;

  // 1. 水平移動: 加速度 + 摩擦
  const moveDir = input.getMoveDir();
  if (moveDir !== 0) {
    player.vel.x = clamp(
      player.vel.x + moveDir * PHYSICS.moveAccel,
      -PHYSICS.moveMaxSpeed,
      PHYSICS.moveMaxSpeed,
    );
  } else {
    player.vel.x *= player.onGround ? PHYSICS.groundFriction : PHYSICS.airFriction;
  }

  // 2. ジャンプ: 接地時に押された瞬間のみ発動
  if (player.onGround && input.consumeJumpPress()) {
    player.vel.y = PHYSICS.jumpVelocity;
    player.onGround = false;
  }

  // 3. 重力
  player.vel.y = Math.min(player.vel.y + PHYSICS.gravity, PHYSICS.maxFallSpeed);

  // 4. x移動(横方向の壁衝突なし)
  player.pos.x = clamp(player.pos.x + player.vel.x, 0, world.levelWidth - player.width);

  // 5. y移動 + top-onlyのAABB着地判定
  const prevBottom = player.pos.y + player.height;
  player.pos.y += player.vel.y;
  const newBottom = player.pos.y + player.height;
  player.onGround = false;
  if (player.vel.y >= 0) {
    for (const platform of world.platforms) {
      const overlapsHorizontally =
        player.pos.x + player.width > platform.x && player.pos.x < platform.x + platform.width;
      if (overlapsHorizontally && prevBottom <= platform.y && newBottom >= platform.y) {
        player.pos.y = platform.y - player.height;
        player.vel.y = 0;
        player.onGround = true;
        break;
      }
    }
  }

  // 6. 死亡: 画面外に落ちたらスタート地点へリスポーン
  if (player.pos.y > world.deathY) {
    player.pos = { ...world.startPos };
    player.vel = zero();
    player.onGround = false;
    world.trail = [];
  }

  // 7. ゴール判定
  const { goal } = world;
  const reachedGoal =
    player.pos.x < goal.x + goal.width &&
    player.pos.x + player.width > goal.x &&
    player.pos.y < goal.y + goal.height &&
    player.pos.y + player.height > goal.y;
  if (reachedGoal) {
    world.status = "cleared";
  }

  // 8. カメラ追従
  world.cameraX = clamp(
    player.pos.x + player.width / 2 - world.canvasWidth / 2,
    0,
    world.levelWidth - world.canvasWidth,
  );

  // トレイル(見た目だけの演出、物理には影響しない)
  world.trail.push({ x: player.pos.x + player.width / 2, y: player.pos.y + player.height / 2 });
  if (world.trail.length > TRAIL_MAX_LENGTH) world.trail.shift();
}
