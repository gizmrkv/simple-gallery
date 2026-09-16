// Converts a MIDI note number to its position on a grand staff (treble + bass
// clef), always spelled with sharps (matching the sharp-only naming used
// elsewhere in this app). Staff position depends only on the diatonic letter
// (A-G), not the accidental, so C and C# sit on the same line/space.

export interface NoteSpelling {
  letter: string;
  sharp: boolean;
  /** Absolute diatonic step, counted so that middle C (MIDI 60) is MIDDLE_C_STEP. */
  step: number;
}

const LETTER_BY_PC = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const LETTER_INDEX_BY_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const SHARP_BY_PC = [false, true, false, true, false, false, true, false, true, false, true, false];

export const MIDDLE_C_STEP = 28; // 4 * 7 + 0

export function spellNote(midi: number): NoteSpelling {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    letter: LETTER_BY_PC[pitchClass],
    sharp: SHARP_BY_PC[pitchClass],
    step: octave * 7 + LETTER_INDEX_BY_PC[pitchClass],
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
