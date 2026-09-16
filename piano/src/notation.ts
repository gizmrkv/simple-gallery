// Converts a MIDI note number to its position on a grand staff (treble +
// bass clef). Staff position depends only on the diatonic letter (A-G), not
// the accidental, so e.g. C# and Db sit on different lines/spaces even
// though they're the same pitch - which letter+accidental is used depends on
// the active key signature (spellNote's `useFlats` argument).

export type Accidental = "sharp" | "flat" | "natural";

export interface NoteSpelling {
  letter: string;
  accidental: Accidental;
  /** Absolute diatonic step, counted so that middle C (MIDI 60) is MIDDLE_C_STEP. */
  step: number;
}

const SHARP_LETTER_BY_PC = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const SHARP_LETTER_INDEX_BY_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const FLAT_LETTER_BY_PC = ["C", "D", "D", "E", "E", "F", "G", "G", "A", "A", "B", "B"];
const FLAT_LETTER_INDEX_BY_PC = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const IS_ALTERED_BY_PC = [false, true, false, true, false, false, true, false, true, false, true, false];

export const MIDDLE_C_STEP = 28; // 4 * 7 + 0

export function spellNote(midi: number, useFlats = false): NoteSpelling {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const altered = IS_ALTERED_BY_PC[pitchClass];
  const letter = useFlats ? FLAT_LETTER_BY_PC[pitchClass] : SHARP_LETTER_BY_PC[pitchClass];
  const letterIndex = useFlats ? FLAT_LETTER_INDEX_BY_PC[pitchClass] : SHARP_LETTER_INDEX_BY_PC[pitchClass];
  return {
    letter,
    accidental: altered ? (useFlats ? "flat" : "sharp") : "natural",
    step: octave * 7 + letterIndex,
  };
}

/** Vertical pixels per diatonic step (half the distance between staff lines). */
export const STEP_PX = 5;
/** y-coordinate of the single ledger line for middle C. */
export const MIDDLE_C_Y = 75;

export function stepToY(step: number): number {
  return MIDDLE_C_Y - (step - MIDDLE_C_STEP) * STEP_PX;
}

export const TREBLE_LINE_STEPS = [30, 32, 34, 36, 38]; // E4 G4 B4 D5 F5
export const BASS_LINE_STEPS = [18, 20, 22, 24, 26]; // G2 B2 D3 F3 A3

/** Steps at which a ledger line must be drawn for a note at `step`. */
export function ledgerStepsFor(step: number): number[] {
  const steps: number[] = [];
  if (step === MIDDLE_C_STEP) steps.push(MIDDLE_C_STEP);
  if (step > 38) for (let s = 40; s <= step; s += 2) steps.push(s);
  if (step < 18) for (let s = 16; s >= step; s -= 2) steps.push(s);
  return steps;
}

// --- Key signatures --------------------------------------------------------
//
// A key signature is derived from the selected Key(root)+Scale by finding
// the major scale it conventionally borrows its sharps/flats from: modes
// borrow the signature of the major scale that contains them (e.g. Dorian
// borrows the signature of the major scale a whole step below its own
// tonic), and harmonic-minor/blues borrow their natural-minor signature,
// writing their altered degree as a one-off accidental instead of a
// different key signature.

export interface KeySignature {
  type: "sharp" | "flat";
  count: number;
  /** Letters carrying the accidental, in conventional writing order. */
  letters: string[];
}

// Pitch class (0-11) -> that major key's conventional signature, using the
// usual enharmonic spelling (Db rather than C#, F# rather than Gb, etc.).
const MAJOR_KEY_SIG_BY_PC: { type: "sharp" | "flat"; count: number }[] = [
  { type: "sharp", count: 0 }, // C
  { type: "flat", count: 5 }, // Db
  { type: "sharp", count: 2 }, // D
  { type: "flat", count: 3 }, // Eb
  { type: "sharp", count: 4 }, // E
  { type: "flat", count: 1 }, // F
  { type: "sharp", count: 6 }, // F#
  { type: "sharp", count: 1 }, // G
  { type: "flat", count: 4 }, // Ab
  { type: "sharp", count: 3 }, // A
  { type: "flat", count: 2 }, // Bb
  { type: "sharp", count: 5 }, // B
];

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

// Semitones from a mode's own tonic down to the tonic of the major scale it
// borrows its key signature from.
const KEY_SIG_MODE_OFFSET: Record<string, number> = {
  Major: 0,
  "Natural Minor": 9,
  "Harmonic Minor": 9,
  Dorian: 2,
  Mixolydian: 7,
  "Major Pentatonic": 0,
  "Minor Pentatonic": 9,
  Blues: 9,
};

export function keySignatureFor(root: number, scaleName: string): KeySignature {
  const offset = KEY_SIG_MODE_OFFSET[scaleName] ?? 0;
  const parentMajorPc = (((root - offset) % 12) + 12) % 12;
  const sig = MAJOR_KEY_SIG_BY_PC[parentMajorPc];
  const order = sig.type === "sharp" ? SHARP_ORDER : FLAT_ORDER;
  return { type: sig.type, count: sig.count, letters: order.slice(0, sig.count) };
}

// Conventional per-letter staff position for key-signature accidentals
// (the same position is reused for both the sharp and flat form of a
// letter - only the glyph drawn there differs).
export const TREBLE_LETTER_STEP: Record<string, number> = { F: 38, C: 35, G: 39, D: 36, A: 33, E: 37, B: 34 };
export const BASS_LETTER_STEP: Record<string, number> = { F: 24, C: 21, G: 25, D: 22, A: 19, E: 23, B: 20 };
