import { InputState } from "./input";
import { LEVEL } from "./level";
import { render } from "./render";
import { step } from "./simulate";
import { createWorld } from "./world";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const controls = document.querySelector<HTMLDivElement>("#controls")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;

canvas.width = 900;
canvas.height = 600;

let world = createWorld(canvas.width, canvas.height, LEVEL);
const input = new InputState();

const resetButton = document.createElement("button");
resetButton.textContent = "リセット";
resetButton.onclick = () => {
  world = createWorld(canvas.width, canvas.height, LEVEL);
};
controls.appendChild(resetButton);

function tick(): void {
  step(world, input);
  render(ctx, world);

  const { player, goal } = world;
  statusEl.textContent =
    world.status === "cleared"
      ? "CLEAR! ゴールに到達しました。リセットで再挑戦できます。"
      : `X: ${Math.round(player.pos.x)}px ／ ゴールまで ${Math.max(0, Math.round(goal.x - player.pos.x))}px`;
}

function loop(): void {
  tick();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// 非表示タブではrequestAnimationFrameがブラウザ仕様で完全停止するため、
// 自動操作ツールから見た目を確認する手段としてrAFに頼らない経路を用意する
// (simple-lead-turretと同じ対処)。devビルドのみ有効。
if (import.meta.env.DEV) {
  (window as unknown as { __sim: unknown }).__sim = {
    get world() {
      return world;
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) tick();
    },
  };
}
