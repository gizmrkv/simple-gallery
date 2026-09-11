import "./style.css";
import { NoiseRenderer, type FieldParams } from "./renderer.ts";
import { buildLut } from "./color/presets.ts";
import { createDefaultState, setupControls } from "./ui.ts";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasArea = document.querySelector(".canvas-area") as HTMLElement;

const state = createDefaultState();
const renderer = new NoiseRenderer(canvas);

// Z軸(time)。animateがオンの間だけ毎フレーム進める。
let t = 0;
const TIME_SCALE = 100;

function render(): void {
  const lut = buildLut(state.colorPreset);
  const params: FieldParams = {
    noiseType: state.noiseType,
    fractalType: state.fractalType,
    seed: state.seed,
    frequency: state.frequency,
    octaves: state.octaves,
    lacunarity: state.lacunarity,
    gain: state.gain,
    pingPongStrength: state.pingPongStrength,
    resolution: state.resolution,
    t,
  };
  renderer.render(params, lut);
}

setupControls(state, render);

// --- canvasのサイズ調整(利用可能領域に収まる正方形として中央寄せ) ---

function resizeCanvas(): void {
  const style = getComputedStyle(canvasArea);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availW = canvasArea.clientWidth - padX;
  const availH = canvasArea.clientHeight - padY;
  const size = Math.max(1, Math.floor(Math.min(availW, availH)));

  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  renderer.resizeTo(size);
  render();
}

new ResizeObserver(resizeCanvas).observe(canvasArea);
resizeCanvas();

// --- メインループ(animate中のみtを進めて再描画する) ---

let lastTime = performance.now();
function loop(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (state.animate) {
    t += state.speed * dt * TIME_SCALE;
    render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
