import type { Level, Platform, Goal } from "./level";
import { zero, type Vec2 } from "./vec2";

export interface Player {
  pos: Vec2;
  vel: Vec2;
  width: number;
  height: number;
  onGround: boolean;
}

export type GameStatus = "playing" | "cleared";

export interface World {
  canvasWidth: number;
  canvasHeight: number;
  levelWidth: number;
  deathY: number;
  startPos: Vec2;
  player: Player;
  platforms: Platform[];
  goal: Goal;
  cameraX: number;
  status: GameStatus;
  trail: Vec2[];
}

export const PHYSICS = {
  gravity: 0.6,
  moveAccel: 0.9,
  moveMaxSpeed: 4.5,
  groundFriction: 0.85,
  airFriction: 0.95,
  jumpVelocity: -12.5,
  maxFallSpeed: 16,
} as const;

const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 40;
const TRAIL_LENGTH = 8;

export function createWorld(canvasWidth: number, canvasHeight: number, level: Level): World {
  return {
    canvasWidth,
    canvasHeight,
    levelWidth: level.levelWidth,
    deathY: level.deathY,
    startPos: level.startPos,
    player: {
      pos: { ...level.startPos },
      vel: zero(),
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      onGround: false,
    },
    platforms: level.platforms,
    goal: level.goal,
    cameraX: 0,
    status: "playing",
    trail: [],
  };
}

export const TRAIL_MAX_LENGTH = TRAIL_LENGTH;
