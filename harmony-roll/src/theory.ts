export type PitchClass = number; // 0-11, 0 = C
export type HarmonicFunction = "T" | "S" | "D";
export type ScaleType = "major" | "naturalMinor" | "harmonicMinor";
export type TriadQuality = "major" | "minor" | "diminished" | "augmented";
export type CadenceType = "authentic" | "plagal" | "deceptive" | "half";

export interface DegreeFunctionDef {
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  function: HarmonicFunction;
  weight: number; // relative sampling weight among degrees sharing this function
}

// Cumulative semitone offsets from the tonic for scale degrees 1..7.
export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

// Harmonic function depends only on the degree number, not the scale type or
// the resulting chord quality, so one table is shared across all scale types.
export const DEGREE_FUNCTIONS: DegreeFunctionDef[] = [
  { degree: 1, function: "T", weight: 0.6 },
  { degree: 2, function: "S", weight: 0.3 },
  { degree: 3, function: "T", weight: 0.15 },
  { degree: 4, function: "S", weight: 0.7 },
  { degree: 5, function: "D", weight: 0.8 },
  { degree: 6, function: "T", weight: 0.25 },
  { degree: 7, function: "D", weight: 0.2 },
];

export const FUNCTION_TRANSITIONS: Record<HarmonicFunction, Record<HarmonicFunction, number>> = {
  T: { T: 0.2, S: 0.4, D: 0.4 },
  S: { T: 0.2, S: 0.1, D: 0.7 },
  D: { T: 0.7, S: 0.05, D: 0.25 },
};

export function degreesForFunction(fn: HarmonicFunction): DegreeFunctionDef[] {
  return DEGREE_FUNCTIONS.filter((d) => d.function === fn);
}

// Pitch class (0-11) of a scale degree. `degreeIndex0` is 0-based and may exceed 6 (wraps octaves).
export function scaleDegreePitchClass(
  root: PitchClass,
  degreeIndex0: number,
  scaleType: ScaleType,
): PitchClass {
  const offsets = SCALE_INTERVALS[scaleType];
  const octaves = Math.floor(degreeIndex0 / 7);
  const idx = ((degreeIndex0 % 7) + 7) % 7;
  return (root + offsets[idx] + octaves * 12) % 12;
}

// Root/3rd/5th pitch classes for the triad built on scale degree `rootDegreeIndex0` (0-based).
export function triadPitchClasses(
  root: PitchClass,
  rootDegreeIndex0: number,
  scaleType: ScaleType,
): [PitchClass, PitchClass, PitchClass] {
  return [
    scaleDegreePitchClass(root, rootDegreeIndex0, scaleType),
    scaleDegreePitchClass(root, rootDegreeIndex0 + 2, scaleType),
    scaleDegreePitchClass(root, rootDegreeIndex0 + 4, scaleType),
  ];
}

// Classifies a triad's quality from the semitone intervals between its stacked
// thirds (root->3rd, 3rd->5th). Any diatonic triad built from a scale made of
// whole/half steps falls into exactly one of these four combinations.
export function classifyTriad(pc: [PitchClass, PitchClass, PitchClass]): TriadQuality {
  const i1 = (((pc[1] - pc[0]) % 12) + 12) % 12;
  const i2 = (((pc[2] - pc[1]) % 12) + 12) % 12;
  if (i1 === 4 && i2 === 3) return "major";
  if (i1 === 3 && i2 === 4) return "minor";
  if (i1 === 3 && i2 === 3) return "diminished";
  if (i1 === 4 && i2 === 4) return "augmented";
  throw new Error(`classifyTriad: unexpected interval pair (${i1}, ${i2}) — not a diatonic triad`);
}

const ROMAN_UPPER = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function romanNumeral(degree: 1 | 2 | 3 | 4 | 5 | 6 | 7, quality: TriadQuality): string {
  const base = ROMAN_UPPER[degree - 1];
  const cased = quality === "minor" || quality === "diminished" ? base.toLowerCase() : base;
  if (quality === "diminished") return `${cased}°`;
  if (quality === "augmented") return `${cased}+`;
  return cased;
}

export interface CadenceDef {
  type: CadenceType;
  weight: number;
  // The (function, forced degree) pair for each of the final bars, in order.
  forcedDegrees: { function: HarmonicFunction; degree: 1 | 2 | 3 | 4 | 5 | 6 | 7 }[];
}

export const CADENCES: CadenceDef[] = [
  {
    type: "authentic",
    weight: 0.5,
    forcedDegrees: [
      { function: "D", degree: 5 },
      { function: "T", degree: 1 },
    ],
  },
  {
    type: "plagal",
    weight: 0.2,
    forcedDegrees: [
      { function: "S", degree: 4 },
      { function: "T", degree: 1 },
    ],
  },
  { type: "half", weight: 0.2, forcedDegrees: [{ function: "D", degree: 5 }] },
  {
    type: "deceptive",
    weight: 0.1,
    forcedDegrees: [
      { function: "D", degree: 5 },
      { function: "T", degree: 6 },
    ],
  },
];
