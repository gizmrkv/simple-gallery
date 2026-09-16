export type WaveformType = OscillatorType;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

const ATTACK = 0.008;
const RELEASE = 0.25;
const PEAK_GAIN = 0.22;

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, Voice>();

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  noteOn(voiceId: string, midi: number, waveform: WaveformType): void {
    const ctx = this.ensureContext();
    this.noteOff(voiceId);

    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = midiToFreq(midi);

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + ATTACK);

    osc.connect(gain).connect(this.master!);
    osc.start(now);

    this.voices.set(voiceId, { osc, gain });
  }

  noteOff(voiceId: string): void {
    const voice = this.voices.get(voiceId);
    if (!voice || !this.ctx) return;
    this.voices.delete(voiceId);

    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + RELEASE);
    voice.osc.stop(now + RELEASE + 0.02);
    voice.osc.onended = () => {
      voice.osc.disconnect();
      voice.gain.disconnect();
    };
  }
}
