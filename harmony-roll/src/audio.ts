import type { Phrase } from "./generate.ts";

export interface PlaybackHandle {
  stop(): void;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleNote(
  ctx: AudioContext,
  gains: GainNode[],
  midiPitch: number,
  startTime: number,
  endTime: number,
  opts: { wave: OscillatorType; peakGain: number; attack: number; release: number },
): void {
  const osc = ctx.createOscillator();
  osc.type = opts.wave;
  osc.frequency.value = midiToFreq(midiPitch);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(opts.peakGain, startTime + opts.attack);
  gain.gain.setValueAtTime(opts.peakGain, Math.max(startTime + opts.attack, endTime - opts.release));
  gain.gain.linearRampToValueAtTime(0, endTime);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(endTime + 0.05);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  gains.push(gain);
}

export function playPhrase(ctx: AudioContext, phrase: Phrase, startTime: number): PlaybackHandle {
  const secondsPerStep = 60 / phrase.tempoBpm;
  const gains: GainNode[] = [];

  for (const chord of phrase.chords) {
    const barStart = startTime + chord.bar * phrase.stepsPerBar * secondsPerStep;
    const barEnd = barStart + phrase.stepsPerBar * secondsPerStep;
    for (const note of chord.notes) {
      scheduleNote(ctx, gains, note, barStart, barEnd, {
        wave: "sine",
        peakGain: 0.08,
        attack: 0.02,
        release: 0.05,
      });
    }
  }

  for (const note of phrase.melodyNotes) {
    const noteStart = startTime + note.startStep * secondsPerStep;
    const noteEnd = noteStart + note.durationSteps * secondsPerStep;
    scheduleNote(ctx, gains, note.pitch, noteStart, noteEnd, {
      wave: "triangle",
      peakGain: 0.18,
      attack: 0.008,
      release: 0.04,
    });
  }

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      for (const gain of gains) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.03);
      }
    },
  };
}
