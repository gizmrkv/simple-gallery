import "./style.css";
import { KEY_DEFS, BASE_MIDI } from "./keymap.ts";
import { SCALES, NOTE_NAMES, scalePitchClasses, noteName } from "./scales.ts";
import { Synth, type WaveformType } from "./audio.ts";

const WAVEFORMS: WaveformType[] = ["triangle", "sine", "square", "sawtooth"];

const keyboardEl = document.querySelector<HTMLDivElement>("#keyboard")!;
const octaveHintEl = document.querySelector<HTMLParagraphElement>("#octaveHint")!;
const waveformSelect = document.querySelector<HTMLSelectElement>("#waveform")!;
const rootSelect = document.querySelector<HTMLSelectElement>("#rootNote")!;
const scaleSelect = document.querySelector<HTMLSelectElement>("#scale")!;

for (const waveform of WAVEFORMS) {
  const option = document.createElement("option");
  option.value = waveform;
  option.textContent = waveform;
  waveformSelect.appendChild(option);
}

for (const [pitchClass, name] of NOTE_NAMES.entries()) {
  const option = document.createElement("option");
  option.value = String(pitchClass);
  option.textContent = name;
  rootSelect.appendChild(option);
}

for (const scale of SCALES) {
  const option = document.createElement("option");
  option.value = scale.name;
  option.textContent = scale.name;
  scaleSelect.appendChild(option);
}

const synth = new Synth();

const KEY_WIDTH = 44;
const BLACK_WIDTH = 30;
const GAP = 6;
const UNIT = KEY_WIDTH + GAP;

const capElements = new Map<string, HTMLDivElement>();
const noteLabelElements = new Map<string, HTMLSpanElement>();

function buildRow(row: 0 | 1): HTMLDivElement {
  const defs = KEY_DEFS.filter((k) => k.row === row);
  const numWhite = Math.max(...defs.filter((k) => !k.black).map((k) => k.slot)) + 1;

  const rowEl = document.createElement("div");
  rowEl.className = "keyrow";
  rowEl.style.width = `${numWhite * KEY_WIDTH + (numWhite - 1) * GAP}px`;

  for (const def of defs) {
    const cap = document.createElement("div");
    cap.className = def.black ? "keycap black" : "keycap white";
    cap.dataset.code = def.code;
    cap.style.left = def.black
      ? `${(def.slot - 0.5) * UNIT + KEY_WIDTH + GAP / 2 - BLACK_WIDTH / 2}px`
      : `${def.slot * UNIT}px`;

    const keyLabel = document.createElement("span");
    keyLabel.className = "key-label";
    keyLabel.textContent = def.label;
    cap.appendChild(keyLabel);

    const noteLabel = document.createElement("span");
    noteLabel.className = "note-label";
    cap.appendChild(noteLabel);

    cap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      playKey(def.code, def.semitone);
    });
    const releasePointer = () => stopKey(def.code);
    cap.addEventListener("pointerup", releasePointer);
    cap.addEventListener("pointerleave", releasePointer);

    rowEl.appendChild(cap);
    capElements.set(def.code, cap);
    noteLabelElements.set(def.code, noteLabel);
  }

  return rowEl;
}

keyboardEl.appendChild(buildRow(1));
keyboardEl.appendChild(buildRow(0));

let octaveShift = 0; // -12, 0, or +12 semitones
let leftShiftDown = false;
let rightShiftDown = false;

function updateOctaveShift(): void {
  octaveShift = (rightShiftDown ? 12 : 0) - (leftShiftDown ? 12 : 0);
  const octaves = octaveShift / 12;
  octaveHintEl.textContent = `Octave shift: ${octaves >= 0 ? "+" : ""}${octaves}`;
  for (const def of KEY_DEFS) {
    noteLabelElements.get(def.code)!.textContent = noteName(BASE_MIDI + def.semitone + octaveShift);
  }
}

function updateScaleHighlight(): void {
  const root = Number(rootSelect.value);
  const scale = SCALES.find((s) => s.name === scaleSelect.value)!;
  const pitchClasses = scalePitchClasses(root, scale);
  for (const def of KEY_DEFS) {
    const pitchClass = ((BASE_MIDI + def.semitone) % 12 + 12) % 12;
    capElements.get(def.code)!.classList.toggle("in-scale", pitchClasses.has(pitchClass));
  }
}

rootSelect.addEventListener("change", updateScaleHighlight);
scaleSelect.addEventListener("change", updateScaleHighlight);

updateOctaveShift();
updateScaleHighlight();

const keyDefsByCode = new Map(KEY_DEFS.map((k) => [k.code, k]));

function playKey(code: string, semitone: number): void {
  synth.noteOn(code, BASE_MIDI + semitone + octaveShift, waveformSelect.value as WaveformType);
  capElements.get(code)?.classList.add("active");
}

function stopKey(code: string): void {
  synth.noteOff(code);
  capElements.get(code)?.classList.remove("active");
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "SELECT" || target.tagName === "INPUT");
}

window.addEventListener("keydown", (e) => {
  if (isFormField(e.target)) return;

  if (e.code === "ShiftLeft") {
    if (!leftShiftDown) {
      leftShiftDown = true;
      updateOctaveShift();
    }
    return;
  }
  if (e.code === "ShiftRight") {
    if (!rightShiftDown) {
      rightShiftDown = true;
      updateOctaveShift();
    }
    return;
  }

  const def = keyDefsByCode.get(e.code);
  if (!def) return;
  e.preventDefault();
  if (e.repeat) return;

  playKey(def.code, def.semitone);
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft") {
    leftShiftDown = false;
    updateOctaveShift();
    return;
  }
  if (e.code === "ShiftRight") {
    rightShiftDown = false;
    updateOctaveShift();
    return;
  }

  const def = keyDefsByCode.get(e.code);
  if (!def) return;
  stopKey(def.code);
});

window.addEventListener("blur", () => {
  for (const def of KEY_DEFS) stopKey(def.code);
  leftShiftDown = false;
  rightShiftDown = false;
  updateOctaveShift();
});
