export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface ScaleDef {
  name: string;
  /** Semitone offsets from the root, ascending within one octave. */
  intervals: number[];
}

export const SCALES: ScaleDef[] = [
  { name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9] },
  { name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
  { name: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
];

export function scalePitchClasses(root: number, scale: ScaleDef): Set<number> {
  return new Set(scale.intervals.map((i) => (root + i) % 12));
}

export function noteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}
