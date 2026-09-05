import {
  chordsForFunction,
  FUNCTION_TRANSITIONS,
  triadPitchClasses,
  type HarmonicFunction,
} from "./theory.ts";

export interface ChordEvent {
  bar: number;
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  roman: string;
  function: HarmonicFunction;
  notes: number[]; // 3 MIDI notes, register 48-59 (root/3rd/5th)
}

export interface MelodyNote {
  pitch: number; // MIDI, register 60-83
  startStep: number; // absolute step index across the whole phrase
  durationSteps: number; // fixed at 1 in v1
}

export interface Phrase {
  rootPitchClass: number; // 0-11
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
// Default cap on how far consecutive melody notes can leap (in semitones), so
// the melody doesn't jump around unpredictably between the chord tones of a bar.
export const DEFAULT_MAX_MELODY_INTERVAL = 7; // a perfect fifth

const CHORD_OCTAVE_BASE = 48;
const MELODY_PITCH_MIN = 60;
const MELODY_PITCH_MAX = 83;

function pickWeighted<T>(entries: [T, number][], rng: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function generateFunctionSequence(bars: number, rng: () => number): HarmonicFunction[] {
  const seq: HarmonicFunction[] = [];
  let current: HarmonicFunction = "T";
  for (let i = 0; i < bars; i++) {
    seq.push(current);
    const transitions = Object.entries(FUNCTION_TRANSITIONS[current]) as [
      HarmonicFunction,
      number,
    ][];
    current = pickWeighted(transitions, rng);
  }
  // Force a simple cadence: the phrase always resolves home on the last bar.
  seq[seq.length - 1] = "T";
  return seq;
}

// All MIDI pitches in the melody register (two octaves) matching one of the chord's pitch classes.
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
      : [candidates.reduce((closest, p) => (Math.abs(p - prevPitch) < Math.abs(closest - prevPitch) ? p : closest))];
  return pool[Math.floor(rng() * pool.length)];
}

function generateMelodyForBar(
  pitchClasses: number[],
  barIndex: number,
  rng: () => number,
  prevPitch: number | null,
  maxInterval: number,
): { notes: MelodyNote[]; lastPitch: number | null } {
  const notes: MelodyNote[] = [];
  const candidates = candidatePitchesForChord(pitchClasses);
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    if (rng() >= NOTE_PROBABILITY) continue;
    const pitch = pickNextMelodyPitch(candidates, prevPitch, maxInterval, rng);
    notes.push({
      pitch,
      startStep: barIndex * STEPS_PER_BAR + s,
      durationSteps: 1,
    });
    prevPitch = pitch;
  }
  return { notes, lastPitch: prevPitch };
}

export function generatePhrase(opts: {
  rootPitchClass: number;
  bars: number;
  tempoBpm?: number;
  maxMelodyInterval?: number;
  rng?: () => number;
}): Phrase {
  const rng = opts.rng ?? Math.random;
  const tempoBpm = opts.tempoBpm ?? DEFAULT_TEMPO_BPM;
  const maxMelodyInterval = opts.maxMelodyInterval ?? DEFAULT_MAX_MELODY_INTERVAL;
  const functionSequence = generateFunctionSequence(opts.bars, rng);

  const chords: ChordEvent[] = [];
  const melodyNotes: MelodyNote[] = [];
  let prevPitch: number | null = null;

  for (let bar = 0; bar < opts.bars; bar++) {
    const fn = functionSequence[bar];
    const candidates = chordsForFunction(fn);
    const chordDef = pickWeighted(
      candidates.map((c) => [c, c.weight] as [typeof c, number]),
      rng,
    );
    const pitchClasses = triadPitchClasses(opts.rootPitchClass, chordDef.degree - 1);
    chords.push({
      bar,
      degree: chordDef.degree,
      roman: chordDef.roman,
      function: fn,
      notes: pitchClasses.map((pc) => CHORD_OCTAVE_BASE + pc),
    });
    const melody = generateMelodyForBar(pitchClasses, bar, rng, prevPitch, maxMelodyInterval);
    melodyNotes.push(...melody.notes);
    prevPitch = melody.lastPitch;
  }

  return {
    rootPitchClass: opts.rootPitchClass,
    bars: opts.bars,
    stepsPerBar: STEPS_PER_BAR,
    tempoBpm,
    functionSequence,
    chords,
    melodyNotes,
  };
}

export function phraseDurationSeconds(phrase: Phrase): number {
  return phrase.bars * phrase.stepsPerBar * (60 / phrase.tempoBpm);
}
