import { InputState } from "./input";
import { CANVAS_H, CANVAS_W, render } from "./render";
import { step } from "./simulate";
import { createWorld } from "./world";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const controls = document.querySelector<HTMLDivElement>("#controls")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

let world = createWorld();
const input = new InputState();

const resetButton = document.createElement("button");
resetButton.textContent = "リセット";
resetButton.onclick = () => {
  world = createWorld();
};
controls.appendChild(resetButton);

function tick(): void {
  step(world, input);
  render(ctx, world);
  statusEl.textContent =
    world.phase === "gameover"
      ? `GAME OVER — スコア ${world.score} ／ レベル ${world.level} ／ リセットで再挑戦できます`
      : "← →: 移動 ／ ↓: ソフトドロップ ／ Space: ハードドロップ ／ ↑ or X: 右回転 ／ Z: 左回転 ／ Shift or C: ホールド";
}

function loop(): void {
  tick();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// 非表示タブではrequestAnimationFrameがブラウザ仕様で完全停止するため、
// 自動操作ツールから見た目を確認する手段としてrAFに頼らない経路を用意する
// (simple-puyo/simple-platformerと同じ対処)。devビルドのみ有効。
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
