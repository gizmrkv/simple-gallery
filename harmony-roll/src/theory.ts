export type PitchClass = number; // 0-11, 0 = C
export type HarmonicFunction = "T" | "S" | "D";

export interface DiatonicChordDef {
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  roman: string;
  function: HarmonicFunction;
  weight: number; // relative sampling weight among chords sharing this function
}

// Cumulative semitone offsets from the tonic for scale degrees 1..7 (major scale, W-W-H-W-W-W-H).
export const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

export const DIATONIC_CHORDS: DiatonicChordDef[] = [
  { degree: 1, roman: "I", function: "T", weight: 0.6 },
  { degree: 2, roman: "ii", function: "S", weight: 0.3 },
  { degree: 3, roman: "iii", function: "T", weight: 0.15 },
  { degree: 4, roman: "IV", function: "S", weight: 0.7 },
  { degree: 5, roman: "V", function: "D", weight: 0.8 },
  { degree: 6, roman: "vi", function: "T", weight: 0.25 },
  { degree: 7, roman: "vii°", function: "D", weight: 0.2 },
];

export const FUNCTION_TRANSITIONS: Record<HarmonicFunction, Record<HarmonicFunction, number>> = {
  T: { T: 0.2, S: 0.4, D: 0.4 },
  S: { T: 0.2, S: 0.1, D: 0.7 },
  D: { T: 0.7, S: 0.05, D: 0.25 },
};

export function chordsForFunction(fn: HarmonicFunction): DiatonicChordDef[] {
  return DIATONIC_CHORDS.filter((c) => c.function === fn);
}

// Pitch class (0-11) of a scale degree. `degreeIndex0` is 0-based and may exceed 6 (wraps octaves).
export function scaleDegreePitchClass(root: PitchClass, degreeIndex0: number): PitchClass {
  const octaves = Math.floor(degreeIndex0 / 7);
  const idx = ((degreeIndex0 % 7) + 7) % 7;
  return (root + MAJOR_SCALE_OFFSETS[idx] + octaves * 12) % 12;
}

// Root/3rd/5th pitch classes for the triad built on scale degree `rootDegreeIndex0` (0-based).
export function triadPitchClasses(
  root: PitchClass,
  rootDegreeIndex0: number,
): [PitchClass, PitchClass, PitchClass] {
  return [
    scaleDegreePitchClass(root, rootDegreeIndex0),
    scaleDegreePitchClass(root, rootDegreeIndex0 + 2),
    scaleDegreePitchClass(root, rootDegreeIndex0 + 4),
  ];
}
