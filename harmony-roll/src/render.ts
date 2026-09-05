import type { HarmonicFunction } from "./theory.ts";
import type { Phrase } from "./generate.ts";

const STEP_PX = 24;
const ROW_PX = 10;
const LEFT_MARGIN = 32;
const RIGHT_MARGIN = 8;
const STRIP_H = 28;
const TOP_MARGIN = STRIP_H + 4;
const BOTTOM_MARGIN = 8;
const PITCH_MIN = 48; // lowest possible chord note
const PITCH_MAX = 83; // highest possible melody note

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

const FUNCTION_COLORS: Record<HarmonicFunction, string> = {
  T: "#22c55e",
  S: "#3b82f6",
  D: "#f97316",
};

const MELODY_COLOR = "#facc15";

export function canvasWidth(phrase: Phrase): number {
  return LEFT_MARGIN + phrase.bars * phrase.stepsPerBar * STEP_PX + RIGHT_MARGIN;
}

export function canvasHeight(): number {
  return TOP_MARGIN + (PITCH_MAX - PITCH_MIN + 1) * ROW_PX + BOTTOM_MARGIN;
}

function stepToX(step: number): number {
  return LEFT_MARGIN + step * STEP_PX;
}

function pitchToY(midi: number): number {
  return TOP_MARGIN + (PITCH_MAX - midi) * ROW_PX;
}

function isBlackKey(pitchClass: number): boolean {
  return BLACK_KEY_PITCH_CLASSES.has(pitchClass);
}

function drawPianoRollBackground(ctx: CanvasRenderingContext2D, phrase: Phrase): void {
  const width = canvasWidth(phrase);

  for (let midi = PITCH_MIN; midi <= PITCH_MAX; midi++) {
    ctx.fillStyle = isBlackKey(midi % 12) ? "#0b1220" : "#111a2e";
    ctx.fillRect(LEFT_MARGIN, pitchToY(midi), width - LEFT_MARGIN, ROW_PX);
  }

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  const totalSteps = phrase.bars * phrase.stepsPerBar;
  for (let step = 0; step <= totalSteps; step++) {
    const x = stepToX(step) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, TOP_MARGIN);
    ctx.lineTo(x, canvasHeight() - BOTTOM_MARGIN);
    ctx.stroke();
  }
  ctx.strokeStyle = "#334155";
  for (let bar = 0; bar <= phrase.bars; bar++) {
    const x = stepToX(bar * phrase.stepsPerBar) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, TOP_MARGIN);
    ctx.lineTo(x, canvasHeight() - BOTTOM_MARGIN);
    ctx.stroke();
  }
}

function drawFunctionStrip(ctx: CanvasRenderingContext2D, phrase: Phrase): void {
  ctx.font = "11px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const chord of phrase.chords) {
    const x0 = stepToX(chord.bar * phrase.stepsPerBar);
    const x1 = stepToX((chord.bar + 1) * phrase.stepsPerBar);
    const color = FUNCTION_COLORS[chord.function];

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fillRect(x0, 0, x1 - x0, STRIP_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, STRIP_H - 1);

    ctx.fillStyle = color;
    ctx.fillText(`${chord.function} ${chord.roman}`, (x0 + x1) / 2, STRIP_H / 2);
  }
}

function drawChordBlocks(ctx: CanvasRenderingContext2D, phrase: Phrase): void {
  for (const chord of phrase.chords) {
    const x0 = stepToX(chord.bar * phrase.stepsPerBar);
    const x1 = stepToX((chord.bar + 1) * phrase.stepsPerBar);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = FUNCTION_COLORS[chord.function];
    for (const note of chord.notes) {
      ctx.fillRect(x0 + 1, pitchToY(note) + 1, x1 - x0 - 2, ROW_PX - 2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMelodyNotes(ctx: CanvasRenderingContext2D, phrase: Phrase): void {
  ctx.fillStyle = MELODY_COLOR;
  for (const note of phrase.melodyNotes) {
    const x0 = stepToX(note.startStep);
    const x1 = stepToX(note.startStep + note.durationSteps);
    ctx.fillRect(x0 + 1, pitchToY(note.pitch) + 1, x1 - x0 - 2, ROW_PX - 2);
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, phrase: Phrase, playheadSeconds: number): void {
  const step = playheadSeconds / (60 / phrase.tempoBpm);
  const x = stepToX(step);
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvasHeight());
  ctx.stroke();
  ctx.lineWidth = 1;
}

export function render(
  ctx: CanvasRenderingContext2D,
  phrase: Phrase,
  playheadSeconds: number | null,
): void {
  ctx.clearRect(0, 0, canvasWidth(phrase), canvasHeight());
  drawPianoRollBackground(ctx, phrase);
  drawFunctionStrip(ctx, phrase);
  drawChordBlocks(ctx, phrase);
  drawMelodyNotes(ctx, phrase);
  if (playheadSeconds !== null) {
    drawPlayhead(ctx, phrase, playheadSeconds);
  }
}
