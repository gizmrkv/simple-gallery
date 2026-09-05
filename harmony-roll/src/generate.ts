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

const CHORD_OCTAVE_BASE = 48;
const MELODY_OCTAVE_BASE = 60;

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

function generateMelodyForBar(
  pitchClasses: number[],
  barIndex: number,
  rng: () => number,
): MelodyNote[] {
  const notes: MelodyNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    if (rng() >= NOTE_PROBABILITY) continue;
    const pc = pitchClasses[Math.floor(rng() * pitchClasses.length)];
    const octaveOffset = rng() < 0.5 ? 0 : 12;
    notes.push({
      pitch: MELODY_OCTAVE_BASE + pc + octaveOffset,
      startStep: barIndex * STEPS_PER_BAR + s,
      durationSteps: 1,
    });
  }
  return notes;
}

export function generatePhrase(opts: {
  rootPitchClass: number;
  bars: number;
  tempoBpm?: number;
  rng?: () => number;
}): Phrase {
  const rng = opts.rng ?? Math.random;
  const tempoBpm = opts.tempoBpm ?? DEFAULT_TEMPO_BPM;
  const functionSequence = generateFunctionSequence(opts.bars, rng);

  const chords: ChordEvent[] = [];
  const melodyNotes: MelodyNote[] = [];

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
    melodyNotes.push(...generateMelodyForBar(pitchClasses, bar, rng));
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
