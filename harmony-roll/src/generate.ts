import {
  CADENCES,
  classifyTriad,
  degreesForFunction,
  FUNCTION_TRANSITIONS,
  romanNumeral,
  SCALE_INTERVALS,
  triadPitchClasses,
  type CadenceDef,
  type HarmonicFunction,
  type PitchClass,
  type ScaleType,
} from "./theory.ts";

export interface ChordEvent {
  bar: number;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  roman: string;
  function: HarmonicFunction;
  notes: number[]; // 3 MIDI notes, voice-led; register ~41-64. May be an inversion.
}

export interface MelodyNote {
  pitch: number; // MIDI, register 60-83
  startStep: number; // absolute step index across the whole phrase
  durationSteps: number; // fixed at 1 in v1
  kind: "chord" | "passing" | "neighbor";
}

export interface Phrase {
  rootPitchClass: number; // 0-11
  scaleType: ScaleType;
  bars: number;
  stepsPerBar: number;
  tempoBpm: number;
  functionSequence: HarmonicFunction[]; // length = bars
  chords: ChordEvent[]; // length = bars
  melodyNotes: MelodyNote[];
}

export const STEPS_PER_BAR = 4;
export const NOTE_PROBABILITY = 0.8;
export const DEFAULT_TEMPO_BPM = 100;
export const DEFAULT_SCALE_TYPE: ScaleType = "major";
// Default cap on how far consecutive melody notes can leap (in semitones), so
// the melody doesn't jump around unpredictably between the chord tones of a bar.
export const DEFAULT_MAX_MELODY_INTERVAL = 7; // a perfect fifth

export const CHORD_REGISTER_MIN = 41; // F2
export const CHORD_REGISTER_MAX = 64; // E4
export const MELODY_PITCH_MIN = 60;
export const MELODY_PITCH_MAX = 83;

const VOICING_TIE_EPSILON = 1;
const PARALLEL_PENALTY = 6;
const COMMON_TONE_BONUS = 1.5;
const DECORATION_PROBABILITY = 0.5;

type BeatSlot = "note" | "rest";
type SkeletonOperator = "repeat" | "fragment" | "rhythmicVariation";

interface BarPlanEntry {
  function: HarmonicFunction;
  forcedDegree: (1 | 2 | 3 | 4 | 5 | 6 | 7) | null;
}

function pickWeighted<T>(entries: [T, number][], rng: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function pickCadence(bars: number, rng: () => number): CadenceDef {
  const eligible = CADENCES.filter((c) => c.forcedDegrees.length <= bars);
  return pickWeighted(
    eligible.map((c) => [c, c.weight] as [CadenceDef, number]),
    rng,
  );
}

function generateBarPlan(bars: number, cadence: CadenceDef, rng: () => number): BarPlanEntry[] {
  const freeBars = bars - cadence.forcedDegrees.length;
  const plan: BarPlanEntry[] = [];
  let current: HarmonicFunction = "T";
  for (let i = 0; i < freeBars; i++) {
    plan.push({ function: current, forcedDegree: null });
    const transitions = Object.entries(FUNCTION_TRANSITIONS[current]) as [HarmonicFunction, number][];
    current = pickWeighted(transitions, rng);
  }
  for (const forced of cadence.forcedDegrees) {
    plan.push({ function: forced.function, forcedDegree: forced.degree });
  }
  return plan;
}

// Root-position voicing (root < 3rd < 5th) for the phrase's first chord, picked
// from the same register-bounded candidate set later chords use, so it can
// never drift outside [CHORD_REGISTER_MIN, CHORD_REGISTER_MAX].
function rootPositionVoicing(pc: [PitchClass, PitchClass, PitchClass]): number[] {
  const candidates = enumerateVoicings(pc, CHORD_REGISTER_MIN, CHORD_REGISTER_MAX);
  const ascending = candidates.filter((c) => c[0] < c[1] && c[1] < c[2]);
  const pool = ascending.length > 0 ? ascending : candidates;
  return pool.reduce((lowest, c) => (c[0] < lowest[0] ? c : lowest), pool[0]);
}

function midiCandidatesForPitchClass(pc: PitchClass, min: number, max: number): number[] {
  const out: number[] = [];
  let midi = min + (((pc - min) % 12) + 12) % 12;
  for (; midi <= max; midi += 12) out.push(midi);
  return out;
}

// Cartesian product of per-pitch-class candidates. Bounded: with a 24-semitone
// register window each pitch class has ~2 candidates, so at most ~8 voicings.
function enumerateVoicings(
  pc: [PitchClass, PitchClass, PitchClass],
  min: number,
  max: number,
): number[][] {
  const [a, b, c] = pc.map((p) => midiCandidatesForPitchClass(p, min, max));
  const out: number[][] = [];
  for (const na of a) for (const nb of b) for (const nc of c) out.push([na, nb, nc]);
  return out;
}

const PERMUTATIONS_3: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// Minimum-total-movement pairing between prev's 3 notes and next's 3 notes,
// allowing voices to be reassigned (a common tone that changes role, e.g. a
// chord's root becoming the next chord's fifth, is still recognized as held).
function bestVoiceMatching(prev: number[], next: number[]) {
  let best: { pairIndexOfPrev: number[]; totalMovement: number; commonTones: number } | null = null;
  for (const perm of PERMUTATIONS_3) {
    let totalMovement = 0;
    let commonTones = 0;
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(prev[i] - next[perm[i]]);
      totalMovement += d;
      if (d === 0) commonTones++;
    }
    if (!best || totalMovement < best.totalMovement) {
      best = { pairIndexOfPrev: [...perm], totalMovement, commonTones };
    }
  }
  return best!;
}

function classifyMotion(
  prevA: number,
  prevB: number,
  nextA: number,
  nextB: number,
): "parallel" | "similar" | "oblique" | "contrary" {
  const dA = nextA - prevA;
  const dB = nextB - prevB;
  if (dA === 0 || dB === 0) return "oblique";
  if (Math.sign(dA) !== Math.sign(dB)) return "contrary";
  return Math.abs(prevB - prevA) === Math.abs(nextB - nextA) ? "parallel" : "similar";
}

function scoreVoicing(prev: number[], candidate: number[]): number {
  const { pairIndexOfPrev, totalMovement, commonTones } = bestVoiceMatching(prev, candidate);
  const bassIdx = prev.indexOf(Math.min(...prev));
  const topIdx = prev.indexOf(Math.max(...prev));
  const bassNext = candidate[pairIndexOfPrev[bassIdx]];
  const topNext = candidate[pairIndexOfPrev[topIdx]];
  const motion = classifyMotion(prev[bassIdx], prev[topIdx], bassNext, topNext);
  const interval = (((topNext - bassNext) % 12) + 12) % 12;
  const isForbiddenParallel = motion === "parallel" && (interval === 0 || interval === 7);
  return totalMovement - commonTones * COMMON_TONE_BONUS + (isForbiddenParallel ? PARALLEL_PENALTY : 0);
}

function chooseVoicing(
  prevVoicing: number[] | null,
  pitchClasses: [PitchClass, PitchClass, PitchClass],
  rng: () => number,
): number[] {
  if (prevVoicing === null) return rootPositionVoicing(pitchClasses);
  const candidates = enumerateVoicings(pitchClasses, CHORD_REGISTER_MIN, CHORD_REGISTER_MAX);
  const scored = candidates
    .map((notes) => ({ notes, cost: scoreVoicing(prevVoicing, notes) }))
    .sort((a, b) => a.cost - b.cost);
  const nearBest = scored.filter((s) => s.cost <= scored[0].cost + VOICING_TIE_EPSILON);
  return nearBest[Math.floor(rng() * nearBest.length)].notes;
}

// All MIDI pitches in the melody register matching one of the chord's pitch classes.
function candidatePitchesForChord(pitchClasses: number[]): number[] {
  const candidates: number[] = [];
  for (let midi = MELODY_PITCH_MIN; midi <= MELODY_PITCH_MAX; midi++) {
    if (pitchClasses.includes(midi % 12)) candidates.push(midi);
  }
  return candidates;
}

// Picks the next melody pitch, preferring candidates within maxInterval
// semitones of the previous note; falls back to the closest candidate if none
// qualify (e.g. right after a chord change to a distant chord).
function pickNextMelodyPitch(
  candidates: number[],
  prevPitch: number | null,
  maxInterval: number,
  rng: () => number,
): number {
  if (prevPitch === null) {
    return candidates[Math.floor(rng() * candidates.length)];
  }
  const nearby = candidates.filter((p) => Math.abs(p - prevPitch) <= maxInterval);
  const pool =
    nearby.length > 0
      ? nearby
      : [
          candidates.reduce((closest, p) =>
            Math.abs(p - prevPitch) < Math.abs(closest - prevPitch) ? p : closest,
          ),
        ];
  return pool[Math.floor(rng() * pool.length)];
}

function generateSeedSkeleton(stepsPerBar: number, rng: () => number): BeatSlot[] {
  const skeleton: BeatSlot[] = [];
  for (let s = 0; s < stepsPerBar; s++) skeleton.push(rng() < NOTE_PROBABILITY ? "note" : "rest");
  return skeleton;
}

const SKELETON_OPERATOR_WEIGHTS: [SkeletonOperator, number][] = [
  ["repeat", 0.5],
  ["rhythmicVariation", 0.3],
  ["fragment", 0.2],
];

// "repeat" resolved against a different bar's chord is a melodic sequence for
// free; "rhythmicVariation" and "fragment" cover the variation/fragmentation
// techniques. No further operators (retrograde, augmentation, ...) are added.
function deriveBarSkeleton(prev: BeatSlot[], rng: () => number): BeatSlot[] {
  const op = pickWeighted(SKELETON_OPERATOR_WEIGHTS, rng);
  if (op === "repeat") return [...prev];
  if (op === "fragment") {
    const frag = prev.slice(0, Math.ceil(prev.length / 2));
    const out: BeatSlot[] = [];
    while (out.length < prev.length) out.push(...frag);
    return out.slice(0, prev.length);
  }
  const out = [...prev];
  const i = Math.floor(rng() * out.length);
  out[i] = out[i] === "note" ? "rest" : "note";
  return out;
}

// All MIDI pitches in [min, max] that belong to the diatonic scale, used to
// find the scale-step distance between two pitches for passing/neighbor tones.
function scaleLadder(root: PitchClass, scaleType: ScaleType, min: number, max: number): number[] {
  const inScale = new Set(SCALE_INTERVALS[scaleType]);
  const ladder: number[] = [];
  for (let midi = min; midi <= max; midi++) {
    if (inScale.has((((midi - root) % 12) + 12) % 12)) ladder.push(midi);
  }
  return ladder;
}

function tryDecorate(
  ladder: number[],
  prevAnchor: number,
  nextAnchor: number,
  rng: () => number,
): { pitch: number; kind: "passing" | "neighbor" } | null {
  const ia = ladder.indexOf(prevAnchor);
  const ib = ladder.indexOf(nextAnchor);
  if (ia === -1 || ib === -1) return null;
  const gap = ib - ia;
  if (gap === 0) {
    const options = [ladder[ia + 1], ladder[ia - 1]].filter((p): p is number => p !== undefined);
    return options.length
      ? { pitch: options[Math.floor(rng() * options.length)], kind: "neighbor" }
      : null;
  }
  if (Math.abs(gap) === 2) return { pitch: ladder[ia + Math.sign(gap)], kind: "passing" };
  return null; // already adjacent (nothing to fill), or gap too wide to bridge in one step
}

function resolveMelody(
  skeleton: BeatSlot[], // flattened across the whole phrase
  chordAt: (globalStep: number) => number[], // pitch classes for the bar owning this step
  ladder: number[],
  maxInterval: number,
  rng: () => number,
): MelodyNote[] {
  const total = skeleton.length;
  const anchor: (number | null)[] = new Array(total).fill(null);
  let prevPitch: number | null = null;
  for (let i = 0; i < total; i++) {
    if (skeleton[i] !== "note") continue;
    const candidates = candidatePitchesForChord(chordAt(i));
    const pitch = pickNextMelodyPitch(candidates, prevPitch, maxInterval, rng);
    anchor[i] = pitch;
    prevPitch = pitch;
  }

  const notes: MelodyNote[] = [];
  for (let i = 0; i < total; i++) {
    if (skeleton[i] === "note") {
      notes.push({ pitch: anchor[i]!, startStep: i, durationSteps: 1, kind: "chord" });
      continue;
    }
    // Only decorate an isolated single-step rest sandwiched between two resolved notes.
    if (i === 0 || i === total - 1) continue;
    if (skeleton[i - 1] !== "note" || skeleton[i + 1] !== "note") continue;
    if (rng() >= DECORATION_PROBABILITY) continue;
    const decorated = tryDecorate(ladder, anchor[i - 1]!, anchor[i + 1]!, rng);
    if (decorated) {
      notes.push({ pitch: decorated.pitch, startStep: i, durationSteps: 1, kind: decorated.kind });
    }
  }
  notes.sort((a, b) => a.startStep - b.startStep);
  return notes;
}

export function generatePhrase(opts: {
  rootPitchClass: number;
  scaleType?: ScaleType;
  bars: number;
  tempoBpm?: number;
  maxMelodyInterval?: number;
  rng?: () => number;
}): Phrase {
  const rng = opts.rng ?? Math.random;
  const scaleType = opts.scaleType ?? DEFAULT_SCALE_TYPE;
  const tempoBpm = opts.tempoBpm ?? DEFAULT_TEMPO_BPM;
  const maxMelodyInterval = opts.maxMelodyInterval ?? DEFAULT_MAX_MELODY_INTERVAL;

  const cadence = pickCadence(opts.bars, rng);
  const barPlan = generateBarPlan(opts.bars, cadence, rng);

  const chords: ChordEvent[] = [];
  const barPitchClasses: [PitchClass, PitchClass, PitchClass][] = [];
  let prevVoicing: number[] | null = null;
  for (let bar = 0; bar < opts.bars; bar++) {
    const plan = barPlan[bar];
    const degree =
      plan.forcedDegree ??
      pickWeighted(
        degreesForFunction(plan.function).map((d) => [d.degree, d.weight] as [1 | 2 | 3 | 4 | 5 | 6 | 7, number]),
        rng,
      );
    const pc = triadPitchClasses(opts.rootPitchClass, degree - 1, scaleType);
    const voicing = chooseVoicing(prevVoicing, pc, rng);
    chords.push({
      bar,
      degree,
      roman: romanNumeral(degree, classifyTriad(pc)),
      function: plan.function,
      notes: voicing,
    });
    barPitchClasses.push(pc);
    prevVoicing = voicing;
  }

  const skeleton: BeatSlot[] = [];
  let barSkeleton: BeatSlot[] | null = null;
  for (let bar = 0; bar < opts.bars; bar++) {
    barSkeleton = barSkeleton === null ? generateSeedSkeleton(STEPS_PER_BAR, rng) : deriveBarSkeleton(barSkeleton, rng);
    skeleton.push(...barSkeleton);
  }

  const ladder = scaleLadder(opts.rootPitchClass, scaleType, MELODY_PITCH_MIN, MELODY_PITCH_MAX);
  const chordAt = (i: number) => barPitchClasses[Math.floor(i / STEPS_PER_BAR)];
  const melodyNotes = resolveMelody(skeleton, chordAt, ladder, maxMelodyInterval, rng);

  return {
    rootPitchClass: opts.rootPitchClass,
    scaleType,
    bars: opts.bars,
    stepsPerBar: STEPS_PER_BAR,
    tempoBpm,
    functionSequence: barPlan.map((p) => p.function),
    chords,
    melodyNotes,
  };
}

export function phraseDurationSeconds(phrase: Phrase): number {
  return phrase.bars * phrase.stepsPerBar * (60 / phrase.tempoBpm);
}
