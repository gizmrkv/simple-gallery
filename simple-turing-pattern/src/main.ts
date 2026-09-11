import "./style.css";
import { GrayScott, type GrayScottParams } from "./simulation";
import { GRADIENTS, DEFAULT_GRADIENT_INDEX, buildLut } from "./gradient";
import { PRESETS, DEFAULT_PRESET_INDEX } from "./presets";
import { Renderer, pointerToGrid } from "./render";

const RESOLUTIONS = [96, 128, 192, 256];
const DEFAULT_RESOLUTION_INDEX = 1; // 128

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasArea = document.querySelector(".canvas-area") as HTMLDivElement;

const presetSelect = document.getElementById("preset") as HTMLSelectElement;
const colormapSelect = document.getElementById("colormap") as HTMLSelectElement;
const resolutionSelect = document.getElementById("resolution") as HTMLSelectElement;

const feedInput = document.getElementById("feed") as HTMLInputElement;
const killInput = document.getElementById("kill") as HTMLInputElement;
const duInput = document.getElementById("du") as HTMLInputElement;
const dvInput = document.getElementById("dv") as HTMLInputElement;
const dtInput = document.getElementById("dt") as HTMLInputElement;
const stepsInput = document.getElementById("steps") as HTMLInputElement;
const brushInput = document.getElementById("brush") as HTMLInputElement;

const feedValue = document.getElementById("feedValue") as HTMLSpanElement;
const killValue = document.getElementById("killValue") as HTMLSpanElement;
const duValue = document.getElementById("duValue") as HTMLSpanElement;
const dvValue = document.getElementById("dvValue") as HTMLSpanElement;
const dtValue = document.getElementById("dtValue") as HTMLSpanElement;
const stepsValue = document.getElementById("stepsValue") as HTMLSpanElement;
const brushValue = document.getElementById("brushValue") as HTMLSpanElement;

const runningInput = document.getElementById("running") as HTMLInputElement;
const stepButton = document.getElementById("stepButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const randomButton = document.getElementById("randomButton") as HTMLButtonElement;

// --- 初期パラメータ ---

const params: GrayScottParams = {
  feed: PRESETS[DEFAULT_PRESET_INDEX].feed,
  kill: PRESETS[DEFAULT_PRESET_INDEX].kill,
  du: 1.0,
  dv: 0.5,
  dt: 1.0,
  stepsPerFrame: 8,
  brushSize: 6,
};
let running = true;

const sim = new GrayScott(RESOLUTIONS[DEFAULT_RESOLUTION_INDEX], params);
const renderer = new Renderer(canvas);
let lut = buildLut(GRADIENTS[DEFAULT_GRADIENT_INDEX]);

function render(): void {
  renderer.render(sim, lut);
}

// --- セレクトボックスの選択肢を構築 ---

for (const [i, preset] of PRESETS.entries()) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = preset.name;
  presetSelect.appendChild(opt);
}
presetSelect.value = String(DEFAULT_PRESET_INDEX);

for (const [i, gradient] of GRADIENTS.entries()) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = gradient.name;
  colormapSelect.appendChild(opt);
}
colormapSelect.value = String(DEFAULT_GRADIENT_INDEX);

for (const [i, res] of RESOLUTIONS.entries()) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = res === 256 ? "256 px (slow)" : `${res} px`;
  resolutionSelect.appendChild(opt);
}
resolutionSelect.value = String(DEFAULT_RESOLUTION_INDEX);

// --- スライダーの初期値と表示 ---

function syncSlider(input: HTMLInputElement, display: HTMLSpanElement, value: number): void {
  input.value = String(value);
  display.textContent = String(value);
}

syncSlider(feedInput, feedValue, params.feed);
syncSlider(killInput, killValue, params.kill);
syncSlider(duInput, duValue, params.du);
syncSlider(dvInput, dvValue, params.dv);
syncSlider(dtInput, dtValue, params.dt);
syncSlider(stepsInput, stepsValue, params.stepsPerFrame);
syncSlider(brushInput, brushValue, params.brushSize);

// --- イベントワイヤリング ---

presetSelect.addEventListener("change", () => {
  const preset = PRESETS[Number(presetSelect.value)];
  params.feed = preset.feed;
  params.kill = preset.kill;
  syncSlider(feedInput, feedValue, params.feed);
  syncSlider(killInput, killValue, params.kill);
  sim.reset();
  render();
});

colormapSelect.addEventListener("change", () => {
  lut = buildLut(GRADIENTS[Number(colormapSelect.value)]);
  render();
});

resolutionSelect.addEventListener("change", () => {
  sim.setResolution(RESOLUTIONS[Number(resolutionSelect.value)]);
  render();
});

feedInput.addEventListener("input", () => {
  params.feed = Number(feedInput.value);
  feedValue.textContent = feedInput.value;
});
killInput.addEventListener("input", () => {
  params.kill = Number(killInput.value);
  killValue.textContent = killInput.value;
});
duInput.addEventListener("input", () => {
  params.du = Number(duInput.value);
  duValue.textContent = duInput.value;
});
dvInput.addEventListener("input", () => {
  params.dv = Number(dvInput.value);
  dvValue.textContent = dvInput.value;
});
dtInput.addEventListener("input", () => {
  params.dt = Number(dtInput.value);
  dtValue.textContent = dtInput.value;
});
stepsInput.addEventListener("input", () => {
  params.stepsPerFrame = Number(stepsInput.value);
  stepsValue.textContent = stepsInput.value;
});
brushInput.addEventListener("input", () => {
  params.brushSize = Number(brushInput.value);
  brushValue.textContent = brushInput.value;
});

runningInput.addEventListener("change", () => {
  running = runningInput.checked;
});

stepButton.addEventListener("click", () => {
  sim.stepOnce();
  render();
});
resetButton.addEventListener("click", () => {
  sim.reset();
  render();
});
randomButton.addEventListener("click", () => {
  sim.randomReseed();
  render();
});

// --- ブラシによる描画(左ドラッグ: 種まき / 右ドラッグ: 消去) ---

let isPainting = false;
let paintSeed = true;

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function paintAt(e: PointerEvent): void {
  const { x, y } = pointerToGrid(e.offsetX, e.offsetY, canvas, sim.resolution);
  sim.stampCircle(x, y, params.brushSize, paintSeed);
  render();
}

canvas.addEventListener("pointerdown", (e) => {
  isPainting = true;
  paintSeed = !(e.button === 2 || e.shiftKey);
  canvas.setPointerCapture(e.pointerId);
  paintAt(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (isPainting) paintAt(e);
});
window.addEventListener("pointerup", () => {
  isPainting = false;
});

// --- canvasのサイズ調整(利用可能領域に収まる正方形として中央寄せ・レターボックス表示) ---

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

// --- メインループ ---

function loop(): void {
  if (running) {
    sim.stepOnce();
    render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
