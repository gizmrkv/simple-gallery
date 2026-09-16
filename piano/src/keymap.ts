// Two-row "typing keyboard as piano" layout: the row starting at Z covers one
// octave-and-a-third chromatically (white keys on Z X C V B N M , . , black
// keys filling the gaps on S D G H J L), and the row starting at Q repeats the
// same pattern one octave higher. This is the layout used by GarageBand/Logic
// Pro's "Musical Typing" and adopted by Ableton Live and many other DAWs/VSTs,
// chosen here because it is a well-established, ergonomically studied
// convention rather than an ad-hoc mapping.

export interface KeyDef {
  code: string;
  label: string;
  /** Semitone offset from BASE_MIDI. */
  semitone: number;
  row: 0 | 1;
  /** White-key slot index within the row; black keys sit at slot + 0.5. */
  slot: number;
  black: boolean;
}

export const BASE_MIDI = 48; // C3, the note played by "Z"

type RawKey = [code: string, label: string, semitone: number, slot: number, black: boolean];

const ROW0: RawKey[] = [
  ["KeyZ", "Z", 0, 0, false],
  ["KeyS", "S", 1, 0, true],
  ["KeyX", "X", 2, 1, false],
  ["KeyD", "D", 3, 1, true],
  ["KeyC", "C", 4, 2, false],
  ["KeyV", "V", 5, 3, false],
  ["KeyG", "G", 6, 3, true],
  ["KeyB", "B", 7, 4, false],
  ["KeyH", "H", 8, 4, true],
  ["KeyN", "N", 9, 5, false],
  ["KeyJ", "J", 10, 5, true],
  ["KeyM", "M", 11, 6, false],
  ["Comma", ",", 12, 7, false],
  ["KeyL", "L", 13, 7, true],
  ["Period", ".", 14, 8, false],
];

const ROW1: RawKey[] = [
  ["KeyQ", "Q", 12, 0, false],
  ["Digit2", "2", 13, 0, true],
  ["KeyW", "W", 14, 1, false],
  ["Digit3", "3", 15, 1, true],
  ["KeyE", "E", 16, 2, false],
  ["KeyR", "R", 17, 3, false],
  ["Digit5", "5", 18, 3, true],
  ["KeyT", "T", 19, 4, false],
  ["Digit6", "6", 20, 4, true],
  ["KeyY", "Y", 21, 5, false],
  ["Digit7", "7", 22, 5, true],
  ["KeyU", "U", 23, 6, false],
  ["KeyI", "I", 24, 7, false],
  ["Digit9", "9", 25, 7, true],
  ["KeyO", "O", 26, 8, false],
  ["Digit0", "0", 27, 8, true],
  ["KeyP", "P", 28, 9, false],
];

function buildRow(defs: RawKey[], row: 0 | 1): KeyDef[] {
  return defs.map(([code, label, semitone, slot, black]) => ({
    code,
    label,
    semitone,
    row,
    slot: black ? slot + 0.5 : slot,
    black,
  }));
}

export const KEY_DEFS: KeyDef[] = [...buildRow(ROW0, 0), ...buildRow(ROW1, 1)];
