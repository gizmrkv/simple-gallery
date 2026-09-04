import type { Vec2 } from "./vec2";

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Goal {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Level {
  platforms: Platform[];
  goal: Goal;
  startPos: Vec2;
  levelWidth: number;
  deathY: number;
}

export const LEVEL: Level = {
  platforms: [
    { x: 0, y: 520, width: 260, height: 80 }, // A: スタート
    { x: 340, y: 520, width: 180, height: 80 }, // B
    { x: 600, y: 430, width: 160, height: 170 }, // C: +90
    { x: 840, y: 470, width: 140, height: 26 }, // D: 浮遊足場
    { x: 1050, y: 560, width: 200, height: 40 }, // E: -90
    { x: 1320, y: 520, width: 180, height: 80 }, // F
    { x: 1580, y: 400, width: 120, height: 26 }, // G: +120
    { x: 1770, y: 480, width: 230, height: 120 }, // H: ゴール
  ],
  goal: { x: 1960, y: 380, width: 30, height: 100 },
  startPos: { x: 40, y: 480 },
  levelWidth: 2050,
  deathY: 640,
};
