import { COLOR_PRESET_OPTIONS, type ColorPreset } from "./color/presets.ts";
import { FRACTAL_TYPE_OPTIONS, NOISE_TYPE_OPTIONS } from "./noise/types.ts";
import type { FractalType, NoiseType } from "./noise/types.ts";

export interface AppState {
  noiseType: NoiseType;
  fractalType: FractalType;
  colorPreset: ColorPreset;
  resolution: number;
  frequency: number;
  seed: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  pingPongStrength: number;
  animate: boolean;
  speed: number;
}

const MAX_SEED = 2147483647;
const RESOLUTIONS = [128, 256, 512];

export function createDefaultState(): AppState {
  return {
    noiseType: "simplexSmooth",
    fractalType: "fbm",
    colorPreset: "grayscale",
    resolution: 512,
    frequency: 0.01,
    seed: 0,
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.5,
    pingPongStrength: 2.0,
    animate: false,
    speed: 0.1,
  };
}

function fillSelect<T extends string>(
  select: HTMLSelectElement,
  options: { value: T; label: string }[],
  selected: T,
): void {
  select.innerHTML = "";
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    select.appendChild(el);
  }
  select.value = selected;
}

export function setupControls(state: AppState, onChange: () => void): void {
  const noiseTypeEl = document.getElementById("noiseType") as HTMLSelectElement;
  const fractalTypeEl = document.getElementById("fractalType") as HTMLSelectElement;
  const colorPresetEl = document.getElementById("colorPreset") as HTMLSelectElement;
  const resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  const frequencyEl = document.getElementById("frequency") as HTMLInputElement;
  const frequencyValueEl = document.getElementById("frequencyValue") as HTMLSpanElement;
  const seedEl = document.getElementById("seed") as HTMLInputElement;
  const randomizeSeedEl = document.getElementById("randomizeSeed") as HTMLButtonElement;
  const octavesEl = document.getElementById("octaves") as HTMLInputElement;
  const octavesValueEl = document.getElementById("octavesValue") as HTMLSpanElement;
  const lacunarityEl = document.getElementById("lacunarity") as HTMLInputElement;
  const lacunarityValueEl = document.getElementById("lacunarityValue") as HTMLSpanElement;
  const gainEl = document.getElementById("gain") as HTMLInputElement;
  const gainValueEl = document.getElementById("gainValue") as HTMLSpanElement;
  const pingPongStrengthEl = document.getElementById("pingPongStrength") as HTMLInputElement;
  const pingPongStrengthValueEl = document.getElementById(
    "pingPongStrengthValue",
  ) as HTMLSpanElement;
  const animateEl = document.getElementById("animate") as HTMLInputElement;
  const speedEl = document.getElementById("speed") as HTMLInputElement;
  const speedValueEl = document.getElementById("speedValue") as HTMLSpanElement;

  fillSelect(noiseTypeEl, NOISE_TYPE_OPTIONS, state.noiseType);
  fillSelect(fractalTypeEl, FRACTAL_TYPE_OPTIONS, state.fractalType);
  fillSelect(colorPresetEl, COLOR_PRESET_OPTIONS, state.colorPreset);

  resolutionEl.innerHTML = "";
  for (const res of RESOLUTIONS) {
    const el = document.createElement("option");
    el.value = String(res);
    el.textContent = `${res} px`;
    resolutionEl.appendChild(el);
  }
  resolutionEl.value = String(state.resolution);

  frequencyEl.value = String(state.frequency);
  frequencyValueEl.textContent = state.frequency.toFixed(3);
  seedEl.value = String(state.seed);
  octavesEl.value = String(state.octaves);
  octavesValueEl.textContent = String(state.octaves);
  lacunarityEl.value = String(state.lacunarity);
  lacunarityValueEl.textContent = state.lacunarity.toFixed(2);
  gainEl.value = String(state.gain);
  gainValueEl.textContent = state.gain.toFixed(2);
  pingPongStrengthEl.value = String(state.pingPongStrength);
  pingPongStrengthValueEl.textContent = state.pingPongStrength.toFixed(2);
  animateEl.checked = state.animate;
  speedEl.value = String(state.speed);
  speedValueEl.textContent = state.speed.toFixed(2);

  noiseTypeEl.addEventListener("change", () => {
    state.noiseType = noiseTypeEl.value as NoiseType;
    onChange();
  });
  fractalTypeEl.addEventListener("change", () => {
    state.fractalType = fractalTypeEl.value as FractalType;
    onChange();
  });
  colorPresetEl.addEventListener("change", () => {
    state.colorPreset = colorPresetEl.value as ColorPreset;
    onChange();
  });
  resolutionEl.addEventListener("change", () => {
    state.resolution = Number(resolutionEl.value);
    onChange();
  });
  frequencyEl.addEventListener("input", () => {
    state.frequency = Number(frequencyEl.value);
    frequencyValueEl.textContent = state.frequency.toFixed(3);
    onChange();
  });
  seedEl.addEventListener("input", () => {
    const clamped = Math.min(MAX_SEED, Math.max(0, Math.floor(Number(seedEl.value) || 0)));
    state.seed = clamped;
    onChange();
  });
  randomizeSeedEl.addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * (MAX_SEED + 1));
    seedEl.value = String(state.seed);
    onChange();
  });
  octavesEl.addEventListener("input", () => {
    state.octaves = Number(octavesEl.value);
    octavesValueEl.textContent = String(state.octaves);
    onChange();
  });
  lacunarityEl.addEventListener("input", () => {
    state.lacunarity = Number(lacunarityEl.value);
    lacunarityValueEl.textContent = state.lacunarity.toFixed(2);
    onChange();
  });
  gainEl.addEventListener("input", () => {
    state.gain = Number(gainEl.value);
    gainValueEl.textContent = state.gain.toFixed(2);
    onChange();
  });
  pingPongStrengthEl.addEventListener("input", () => {
    state.pingPongStrength = Number(pingPongStrengthEl.value);
    pingPongStrengthValueEl.textContent = state.pingPongStrength.toFixed(2);
    onChange();
  });
  animateEl.addEventListener("change", () => {
    state.animate = animateEl.checked;
    onChange();
  });
  speedEl.addEventListener("input", () => {
    state.speed = Number(speedEl.value);
    speedValueEl.textContent = state.speed.toFixed(2);
    onChange();
  });
}
