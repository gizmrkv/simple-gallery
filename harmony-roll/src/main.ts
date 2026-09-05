import "./style.css";
import { generatePhrase, phraseDurationSeconds, type Phrase } from "./generate.ts";
import { playPhrase, type PlaybackHandle } from "./audio.ts";
import { render, canvasWidth, canvasHeight } from "./render.ts";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BAR_OPTIONS = [4, 8];

const app = document.querySelector<HTMLDivElement>("#app")!;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const controls = document.querySelector<HTMLDivElement>("#controls")!;
const status = document.querySelector<HTMLDivElement>("#status")!;

const rootSelect = document.createElement("select");
for (const [pc, name] of NOTE_NAMES.entries()) {
  const option = document.createElement("option");
  option.value = String(pc);
  option.textContent = name;
  rootSelect.appendChild(option);
}

const barsSelect = document.createElement("select");
for (const bars of BAR_OPTIONS) {
  const option = document.createElement("option");
  option.value = String(bars);
  option.textContent = `${bars}小節`;
  barsSelect.appendChild(option);
}

const generateButton = document.createElement("button");
generateButton.textContent = "Generate";

const playButton = document.createElement("button");
playButton.textContent = "Play";

controls.append(rootSelect, barsSelect, generateButton, playButton);
app.insertBefore(controls, canvas);

let phrase: Phrase = generatePhrase({ rootPitchClass: 0, bars: BAR_OPTIONS[0] });
let audioCtx: AudioContext | null = null;
let playback: PlaybackHandle | null = null;
let playbackStartTime = 0;
let isPlaying = false;

function resizeCanvas(): void {
  canvas.width = canvasWidth(phrase);
  canvas.height = canvasHeight();
}

function stopPlayback(): void {
  playback?.stop();
  playback = null;
  isPlaying = false;
  playButton.textContent = "Play";
}

function regenerate(): void {
  stopPlayback();
  phrase = generatePhrase({
    rootPitchClass: Number(rootSelect.value),
    bars: Number(barsSelect.value),
  });
  resizeCanvas();
  status.textContent = `Key: ${NOTE_NAMES[phrase.rootPitchClass]} major / ${phrase.bars} bars`;
}

function togglePlayback(): void {
  if (isPlaying) {
    stopPlayback();
    return;
  }
  audioCtx ??= new AudioContext();
  void audioCtx.resume();
  playbackStartTime = audioCtx.currentTime + 0.1;
  playback = playPhrase(audioCtx, phrase, playbackStartTime);
  isPlaying = true;
  playButton.textContent = "Stop";
}

generateButton.addEventListener("click", regenerate);
playButton.addEventListener("click", togglePlayback);

function frame(): void {
  if (isPlaying && audioCtx) {
    const elapsed = audioCtx.currentTime - playbackStartTime;
    if (elapsed >= phraseDurationSeconds(phrase)) {
      stopPlayback();
      render(ctx, phrase, null);
    } else {
      render(ctx, phrase, elapsed);
    }
  } else {
    render(ctx, phrase, null);
  }
  requestAnimationFrame(frame);
}

resizeCanvas();
status.textContent = `Key: ${NOTE_NAMES[phrase.rootPitchClass]} major / ${phrase.bars} bars`;
requestAnimationFrame(frame);
