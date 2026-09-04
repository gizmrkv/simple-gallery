import { InputState } from './input';
import { predictAimPoint } from './intercept';
import { render } from './render';
import { step } from './simulate';
import { sub } from './vec2';
import { createWorld, PHYSICS, type MotionMode } from './world';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const ctx = canvas.getContext('2d')!;
const controls = document.querySelector<HTMLDivElement>('#controls')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;

canvas.width = 900;
canvas.height = 600;

let world = createWorld(canvas.width, canvas.height);
const input = new InputState();

const modeButton = document.createElement('button');
function updateModeButton(): void {
  modeButton.textContent = `モード: ${world.target.mode === 'constant' ? '等速直線運動' : '加速度運動'} (M で切替)`;
}
modeButton.onclick = () => toggleMode();
updateModeButton();
controls.appendChild(modeButton);

const debugLabel = document.createElement('label');
const debugCheckbox = document.createElement('input');
debugCheckbox.type = 'checkbox';
debugLabel.appendChild(debugCheckbox);
debugLabel.append('予測着弾点を表示');
controls.appendChild(debugLabel);

const resetButton = document.createElement('button');
resetButton.textContent = 'リセット';
resetButton.onclick = () => {
  const mode: MotionMode = world.target.mode;
  world = createWorld(canvas.width, canvas.height);
  world.target.mode = mode;
};
controls.appendChild(resetButton);

function toggleMode(): void {
  world.target.mode = world.target.mode === 'constant' ? 'accelerated' : 'constant';
  updateModeButton();
}
input.onModeToggle(toggleMode);

function tick(): void {
  step(world, input.getDirection());

  const debugAimPoint = debugCheckbox.checked
    ? predictAimPoint(
        world.turretPos,
        world.target.pos,
        world.target.vel,
        sub(world.target.vel, world.target.prevVel),
        PHYSICS.bulletSpeed,
        Math.max(world.width, world.height) / PHYSICS.bulletSpeed,
      )
    : null;

  render(ctx, world, debugAimPoint);

  const accuracy = world.shotsFired > 0 ? ((world.hits / world.shotsFired) * 100).toFixed(0) : '-';
  statusEl.textContent = `命中 ${world.hits} / 発射 ${world.shotsFired} (命中率 ${accuracy}%)`;
}

function loop(): void {
  tick();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// 非表示タブではrequestAnimationFrameがブラウザ仕様で完全停止するため、
// 自動操作ツールから見た目を確認する手段としてrAFに頼らない経路を用意する
// (simple-boids-likeと同じ対処)。devビルドのみ有効。
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
