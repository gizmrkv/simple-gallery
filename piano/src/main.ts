import "./style.css";
import { KEY_DEFS, BASE_MIDI } from "./keymap.ts";
import { SCALES, NOTE_NAMES, scalePitchClasses, noteName } from "./scales.ts";
import { Synth, type WaveformType } from "./audio.ts";
import { StaffView } from "./staff.ts";
import { keySignatureFor } from "./notation.ts";

const WAVEFORMS: WaveformType[] = ["triangle", "sine", "square", "sawtooth"];

const staffView = new StaffView(document.querySelector<HTMLDivElement>("#staff")!);
const keyboardEl = document.querySelector<HTMLDivElement>("#keyboard")!;
const octaveHintEl = document.querySelector<HTMLParagraphElement>("#octaveHint")!;
const layoutModeSelect = document.querySelector<HTMLSelectElement>("#layoutMode")!;
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

const keyDefsByCode = new Map(KEY_DEFS.map((k) => [k.code, k]));
const scaleKeyDefsByCode = new Map(KEY_DEFS.filter((k) => !k.black).map((k) => [k.code, k]));

let layoutMode: "piano" | "scale" = "piano";

function baseMidiForCode(code: string): number | undefined {
  if (layoutMode === "piano") {
    const def = keyDefsByCode.get(code);
    return def ? BASE_MIDI + def.semitone : undefined;
  }
  const def = scaleKeyDefsByCode.get(code);
  if (!def) return undefined;
  const root = Number(rootSelect.value);
  const scale = SCALES.find((s) => s.name === scaleSelect.value)!;
  const scaleLength = scale.intervals.length;
  // row1 starts one full scale-cycle above row0 - mirrors the chromatic
  // layout's row1 = row0 + 12 semitones, with the same deliberate overlap
  // so both hands can play across the seam.
  const degreeIndex = (def.row === 0 ? 0 : scaleLength) + def.slot;
  const octaveOffset = Math.floor(degreeIndex / scaleLength);
  const degreeWithinScale = degreeIndex % scaleLength;
  return BASE_MIDI + root + octaveOffset * 12 + scale.intervals[degreeWithinScale];
}

function midiForCode(code: string): number | undefined {
  const base = baseMidiForCode(code);
  return base === undefined ? undefined : base + octaveShift;
}

function addKeycapListeners(cap: HTMLDivElement, code: string): void {
  cap.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    playKey(code);
  });
  const releasePointer = () => stopKey(code);
  cap.addEventListener("pointerup", releasePointer);
  cap.addEventListener("pointerleave", releasePointer);
}

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

    addKeycapListeners(cap, def.code);

    rowEl.appendChild(cap);
    capElements.set(def.code, cap);
    noteLabelElements.set(def.code, noteLabel);
  }

  return rowEl;
}

function buildScaleRow(row: 0 | 1): HTMLDivElement {
  const defs = [...scaleKeyDefsByCode.values()].filter((k) => k.row === row).sort((a, b) => a.slot - b.slot);

  const rowEl = document.createElement("div");
  rowEl.className = "keyrow flat";

  for (const def of defs) {
    const cap = document.createElement("div");
    cap.className = "keycap scale-key";
    cap.dataset.code = def.code;

    const keyLabel = document.createElement("span");
    keyLabel.className = "key-label";
    keyLabel.textContent = def.label;
    cap.appendChild(keyLabel);

    const noteLabel = document.createElement("span");
    noteLabel.className = "note-label";
    cap.appendChild(noteLabel);

    addKeycapListeners(cap, def.code);

    rowEl.appendChild(cap);
    capElements.set(def.code, cap);
    noteLabelElements.set(def.code, noteLabel);
  }

  return rowEl;
}

function buildKeyboard(): void {
  keyboardEl.innerHTML = "";
  capElements.clear();
  noteLabelElements.clear();
  if (layoutMode === "piano") {
    keyboardEl.appendChild(buildRow(1));
    keyboardEl.appendChild(buildRow(0));
  } else {
    keyboardEl.appendChild(buildScaleRow(1));
    keyboardEl.appendChild(buildScaleRow(0));
  }
}

let octaveShift = 0; // -12, 0, or +12 semitones
let leftShiftDown = false;
let rightShiftDown = false;

function refreshLabels(): void {
  for (const [code, label] of noteLabelElements) {
    const base = baseMidiForCode(code);
    if (base !== undefined) label.textContent = noteName(base + octaveShift);
  }
}

function updateOctaveShift(): void {
  octaveShift = (rightShiftDown ? 12 : 0) - (leftShiftDown ? 12 : 0);
  const octaves = octaveShift / 12;
  octaveHintEl.textContent = `Octave shift: ${octaves >= 0 ? "+" : ""}${octaves}`;
  refreshLabels();
}

function updateHighlightAndKeySignature(): void {
  const root = Number(rootSelect.value);
  const scale = SCALES.find((s) => s.name === scaleSelect.value)!;
  if (layoutMode === "piano") {
    const pitchClasses = scalePitchClasses(root, scale);
    for (const def of KEY_DEFS) {
      const pitchClass = ((BASE_MIDI + def.semitone) % 12 + 12) % 12;
      capElements.get(def.code)!.classList.toggle("in-scale", pitchClasses.has(pitchClass));
    }
  }
  staffView.setKeySignature(keySignatureFor(root, scale.name));
}

function onKeyOrScaleChange(): void {
  updateHighlightAndKeySignature();
  refreshLabels();
}

rootSelect.addEventListener("change", onKeyOrScaleChange);
scaleSelect.addEventListener("change", onKeyOrScaleChange);

const heldCodes = new Set<string>();

function playKey(code: string): void {
  const midi = midiForCode(code);
  if (midi === undefined) return;
  synth.noteOn(code, midi, waveformSelect.value as WaveformType);
  capElements.get(code)?.classList.add("active");
  staffView.noteOn(code, midi);
  heldCodes.add(code);
}

function stopKey(code: string): void {
  synth.noteOff(code);
  capElements.get(code)?.classList.remove("active");
  staffView.noteOff(code);
  heldCodes.delete(code);
}

function releaseAllKeys(): void {
  for (const code of [...heldCodes]) stopKey(code);
}

buildKeyboard();
updateOctaveShift();
updateHighlightAndKeySignature();

layoutModeSelect.addEventListener("change", () => {
  releaseAllKeys();
  layoutMode = layoutModeSelect.value as "piano" | "scale";
  buildKeyboard();
  updateHighlightAndKeySignature();
  refreshLabels();
});

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

  if (!capElements.has(e.code)) return;
  e.preventDefault();
  if (e.repeat) return;

  playKey(e.code);
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

  if (!capElements.has(e.code)) return;
  stopKey(e.code);
});

window.addEventListener("blur", () => {
  releaseAllKeys();
  leftShiftDown = false;
  rightShiftDown = false;
  updateOctaveShift();
});
