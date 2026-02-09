import { Mode } from '../types';
import type {
  AudioDirectorSnapshot,
  EnvironDiagnostics,
  GenerativeDiagnostics,
  IntensityLevel,
  KHSDiagnostics,
  MemoryDiagnostics,
  ModeAudioContract,
  ModeDiagnosticsMap,
  ModeOutputState,
  OracleDiagnostics,
  RadioCoreDiagnostics,
  SpectralBias,
} from '../types/audio';

const SILENCE_DB = -60;
const CONTRACT_SECONDS = 3;

const rmsToDb = (rms: number) => {
  const safe = Math.max(1e-7, rms);
  return 20 * Math.log10(safe);
};

const clampHz = (ctx: AudioContext, hz: number) => {
  const top = (ctx.sampleRate * 0.5) * 0.9;
  return Math.max(20, Math.min(top, hz));
};

const createNoiseBuffer = (ctx: AudioContext, seconds = 2, pink = false) => {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = (Math.random() * 2) - 1;
    if (pink) {
      last = (last + (0.05 * white)) / 1.05;
      data[i] = last;
    } else {
      data[i] = white;
    }
  }
  return buffer;
};

const createImpulseResponse = (ctx: AudioContext, seconds = 4.5, decay = 2.5) => {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const n = (Math.random() * 2) - 1;
      const env = Math.pow(1 - (i / length), decay);
      data[i] = n * env * (ch === 0 ? 1 : 0.93);
    }
  }
  return buffer;
};

interface ModeGraph {
  input?: AudioNode;
  output: AudioNode;
  dispose: () => void;
}

interface ModeEngine<TDiag extends ModeAudioContract> {
  readonly mode: Mode;
  createGraph(ctx: AudioContext): ModeGraph;
  start(): Promise<void> | void;
  stop(): void;
  setParams(params: Record<string, unknown>): void;
  setContract(contract: ModeAudioContract): void;
  getDiagnostics(): TDiag;
  ensureFallback(reason: string): void;
  isFallbackActive(): boolean;
  getFallbackReason(): string | null;
}

abstract class BaseModeEngine<TDiag extends ModeAudioContract> implements ModeEngine<TDiag> {
  public readonly mode: Mode;
  protected ctx: AudioContext | null = null;
  protected output!: GainNode;
  protected fallbackActive = false;
  protected fallbackReason: string | null = null;
  protected contract: ModeAudioContract = {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
  };
  private intervals: number[] = [];
  private timeouts: number[] = [];

  constructor(mode: Mode) {
    this.mode = mode;
  }

  public createGraph(ctx: AudioContext): ModeGraph {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.setValueAtTime(1, ctx.currentTime);
    return {
      output: this.output,
      dispose: () => this.disposeTimers(),
    };
  }

  public start(): Promise<void> | void {}

  public stop(): void {
    this.disposeTimers();
  }

  public setParams(_params: Record<string, unknown>): void {}

  public setContract(contract: ModeAudioContract): void {
    this.contract = {
      ...contract,
      fallback: this.fallbackActive,
      fallbackReason: this.fallbackReason,
      modeOut: this.fallbackActive ? 'FALLBACK' : contract.modeOut,
    };
  }

  public ensureFallback(reason: string): void {
    if (this.fallbackActive) return;
    this.fallbackActive = true;
    this.fallbackReason = reason;
    this.activateFallback();
  }

  public isFallbackActive(): boolean {
    return this.fallbackActive;
  }

  public getFallbackReason(): string | null {
    return this.fallbackReason;
  }

  protected abstract activateFallback(): void;
  public abstract getDiagnostics(): TDiag;

  protected trackInterval(id: number): void {
    this.intervals.push(id);
  }

  protected trackTimeout(id: number): void {
    this.timeouts.push(id);
  }

  protected disposeTimers(): void {
    this.intervals.forEach((id) => window.clearInterval(id));
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.intervals = [];
    this.timeouts = [];
  }
}

class DroneEngine extends BaseModeEngine<RadioCoreDiagnostics> {
  private oscillators: OscillatorNode[] = [];
  private lfos: OscillatorNode[] = [];
  private noise: AudioBufferSourceNode | null = null;
  private filter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private cutoff = 420;
  private resonance = 6;
  private stepType = 'BOOT';
  private signalStrength = 0;
  private bars = new Array(7).fill(0);
  private drift = 1;
  private fm = false;
  private sub = true;
  private traunsteinActive = false;
  private traunsteinIntensity: IntensityLevel = 'PRESENT';
  private subGain: GainNode | null = null;
  private traunsteinA: OscillatorNode | null = null;
  private traunsteinB: OscillatorNode | null = null;
  private traunsteinNoise: AudioBufferSourceNode | null = null;
  private traunsteinGain: GainNode | null = null;
  private traunsteinFilter: BiquadFilterNode | null = null;
  private traunsteinDelay: DelayNode | null = null;
  private traunsteinFeedback: GainNode | null = null;
  private started = false;

  constructor() {
    super(Mode.DRONE);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(this.cutoff, ctx.currentTime);
    this.filter.Q.setValueAtTime(this.resonance, ctx.currentTime);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.filter.connect(this.analyser);
    this.analyser.connect(this.output);

    const freqs = [55, 82.5, 110, 165, 220, 330];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.01 + (i * 0.01), ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.3, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      osc.connect(gain);
      gain.connect(this.filter);
      this.oscillators.push(osc);
      this.lfos.push(lfo);
    });

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(27.5, ctx.currentTime);
    this.subGain = ctx.createGain();
    this.subGain.gain.setValueAtTime(this.sub ? 0.18 : 0, ctx.currentTime);
    subOsc.connect(this.subGain);
    this.subGain.connect(this.filter);
    this.oscillators.push(subOsc);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(ctx, 2, true);
    noiseSource.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.03, ctx.currentTime);
    noiseSource.connect(noiseGain);
    noiseGain.connect(this.filter);
    this.noise = noiseSource;

    this.traunsteinA = ctx.createOscillator();
    this.traunsteinA.type = 'triangle';
    this.traunsteinA.frequency.setValueAtTime(38, ctx.currentTime);
    const trAGain = ctx.createGain();
    trAGain.gain.setValueAtTime(0.08, ctx.currentTime);

    this.traunsteinB = ctx.createOscillator();
    this.traunsteinB.type = 'sawtooth';
    this.traunsteinB.frequency.setValueAtTime(57, ctx.currentTime);
    const trBGain = ctx.createGain();
    trBGain.gain.setValueAtTime(0.05, ctx.currentTime);

    this.traunsteinNoise = ctx.createBufferSource();
    this.traunsteinNoise.buffer = createNoiseBuffer(ctx, 3, true);
    this.traunsteinNoise.loop = true;
    const trNoiseGain = ctx.createGain();
    trNoiseGain.gain.setValueAtTime(0.04, ctx.currentTime);

    this.traunsteinFilter = ctx.createBiquadFilter();
    this.traunsteinFilter.type = 'bandpass';
    this.traunsteinFilter.frequency.setValueAtTime(160, ctx.currentTime);
    this.traunsteinFilter.Q.setValueAtTime(5.5, ctx.currentTime);
    this.traunsteinDelay = ctx.createDelay(1.2);
    this.traunsteinDelay.delayTime.setValueAtTime(0.34, ctx.currentTime);
    this.traunsteinFeedback = ctx.createGain();
    this.traunsteinFeedback.gain.setValueAtTime(0.36, ctx.currentTime);
    this.traunsteinGain = ctx.createGain();
    this.traunsteinGain.gain.setValueAtTime(0, ctx.currentTime);

    this.traunsteinA.connect(trAGain);
    trAGain.connect(this.traunsteinFilter);
    this.traunsteinB.connect(trBGain);
    trBGain.connect(this.traunsteinFilter);
    this.traunsteinNoise.connect(trNoiseGain);
    trNoiseGain.connect(this.traunsteinFilter);
    this.traunsteinFilter.connect(this.traunsteinDelay);
    this.traunsteinDelay.connect(this.traunsteinFeedback);
    this.traunsteinFeedback.connect(this.traunsteinDelay);
    this.traunsteinFilter.connect(this.traunsteinGain);
    this.traunsteinDelay.connect(this.traunsteinGain);
    this.traunsteinGain.connect(this.filter);

    return {
      ...base,
      dispose: () => {
        try { this.output.disconnect(); } catch {}
        try { this.filter.disconnect(); } catch {}
        try { this.analyser.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override start(): void {
    if (!this.ctx || this.started) return;
    const now = this.ctx.currentTime;
    this.started = true;
    this.oscillators.forEach((osc) => {
      try { osc.start(now); } catch {}
    });
    this.lfos.forEach((lfo) => {
      try { lfo.start(now); } catch {}
    });
    try { this.noise?.start(now); } catch {}
    try { this.traunsteinA?.start(now); } catch {}
    try { this.traunsteinB?.start(now); } catch {}
    try { this.traunsteinNoise?.start(now); } catch {}

    const stepId = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const cutoff = 160 + Math.random() * 2600;
      const q = 2 + Math.random() * 18;
      this.filter.frequency.setTargetAtTime(clampHz(this.ctx, cutoff), t, 0.08);
      this.filter.Q.setTargetAtTime(q, t, 0.08);
      this.cutoff = Math.round(cutoff);
      this.resonance = Number(q.toFixed(1));
      this.stepType = Math.random() > 0.5 ? 'FRQ_STEP' : 'RES_STEP';
      this.oscillators.forEach((osc, i) => {
        const det = ((Math.random() - 0.5) * 16) * this.drift;
        osc.detune.setTargetAtTime(det, t, 0.2 + (i * 0.03));
      });
      const intensityScale = this.traunsteinIntensity === 'CALM' ? 0.55 : this.traunsteinIntensity === 'PRESENT' ? 0.9 : 1.35;
      const activeGain = this.traunsteinActive ? (0.08 * intensityScale) : 0;
      this.traunsteinGain?.gain.setTargetAtTime(activeGain, t, 0.14);
      this.traunsteinFilter?.frequency.setTargetAtTime(clampHz(this.ctx, 120 + (Math.random() * 520 * intensityScale)), t, 0.14);
      this.traunsteinFilter?.Q.setTargetAtTime(4 + (Math.random() * 6 * intensityScale), t, 0.16);
      this.traunsteinDelay?.delayTime.setTargetAtTime(0.24 + (Math.random() * 0.32), t, 0.18);
      this.traunsteinFeedback?.gain.setTargetAtTime(this.traunsteinActive ? Math.min(0.72, 0.22 + (0.24 * intensityScale)) : 0.12, t, 0.18);
      const trBase = 31 + ((this.signalStrength / 100) * 22);
      this.traunsteinA?.frequency.setTargetAtTime(trBase, t, 0.1);
      this.traunsteinB?.frequency.setTargetAtTime(trBase * (1.46 + (Math.random() * 0.08)), t, 0.1);
    }, 450);
    this.trackInterval(stepId);

    const visId = window.setInterval(() => {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const bucket = Math.floor(data.length / 7);
      const levels = new Array(7).fill(0).map((_, i) => {
        let sum = 0;
        const start = i * bucket;
        const end = i === 6 ? data.length : (i + 1) * bucket;
        for (let k = start; k < end; k += 1) sum += data[k];
        return Math.round((sum / Math.max(1, end - start)) / 255 * 100);
      });
      this.bars = levels;
      this.signalStrength = Math.round(levels.reduce((a, b) => a + b, 0) / 7);
    }, 120);
    this.trackInterval(visId);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.2);
    const killId = window.setTimeout(() => {
      this.oscillators.forEach((osc) => { try { osc.stop(); } catch {} });
      this.lfos.forEach((lfo) => { try { lfo.stop(); } catch {} });
      try { this.noise?.stop(); } catch {}
      try { this.traunsteinA?.stop(); } catch {}
      try { this.traunsteinB?.stop(); } catch {}
      try { this.traunsteinNoise?.stop(); } catch {}
      this.started = false;
    }, 260);
    this.trackTimeout(killId as unknown as number);
    super.stop();
  }

  public override setParams(params: Record<string, unknown>): void {
    if (!this.ctx) return;
    if (typeof params.drift === 'number') this.drift = Math.max(0, Math.min(4, params.drift));
    if (typeof params.fm === 'boolean') this.fm = params.fm;
    if (typeof params.sub === 'boolean') {
      this.sub = params.sub;
      if (this.subGain) {
        this.subGain.gain.setTargetAtTime(this.sub ? 0.18 : 0, this.ctx.currentTime, 0.12);
      }
    }
    if (typeof params.traunsteinActive === 'boolean') this.traunsteinActive = params.traunsteinActive;
    if (params.traunsteinIntensity === 'CALM' || params.traunsteinIntensity === 'PRESENT' || params.traunsteinIntensity === 'HAUNTED') {
      this.traunsteinIntensity = params.traunsteinIntensity;
    }
    if (this.fm) {
      this.oscillators.forEach((osc, i) => {
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      });
    } else {
      this.oscillators.forEach((osc, i) => {
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      });
    }
  }

  protected override activateFallback(): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = createNoiseBuffer(this.ctx, 2, true);
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    src.connect(gain);
    gain.connect(this.filter);
    src.start();
  }

  public override getDiagnostics(): RadioCoreDiagnostics {
    return {
      ...this.contract,
      bars: [...this.bars],
      cutoff: this.cutoff,
      resonance: this.resonance,
      stepType: this.stepType,
      signalStrength: this.signalStrength,
      traunsteinActive: this.traunsteinActive,
      traunsteinIntensity: this.traunsteinIntensity,
    };
  }
}

class EnvironEngine extends BaseModeEngine<EnvironDiagnostics> {
  private noise: AudioBufferSourceNode | null = null;
  private sub: OscillatorNode | null = null;
  private noiseGain: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private droneGains: GainNode[] = [];
  private matrixValues: number[][] = Array.from({ length: 12 }, () => (
    Array.from({ length: 12 }, () => Math.random())
  ));
  private matrix: string[] = Array.from({ length: 12 }, () => '.'.repeat(12));
  private activeCells = 0;
  private roomFlux = 0;
  private pressure = 0;
  private started = false;

  constructor() {
    super(Mode.ENVIRON);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    const freqs = [73, 110, 147, 165, 220, 277, 330, 440, 554, 659, 880, 1109];
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.8, ctx.currentTime);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i * 2 / curve.length) - 1;
      curve[i] = ((Math.PI + 4) * x) / (Math.PI + (4 * Math.abs(x)));
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-26, ctx.currentTime);
    comp.ratio.setValueAtTime(4, ctx.currentTime);
    comp.attack.setValueAtTime(0.01, ctx.currentTime);
    comp.release.setValueAtTime(0.2, ctx.currentTime);
    mix.connect(shaper);
    shaper.connect(comp);
    comp.connect(this.output);

    freqs.forEach((f) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(clampHz(ctx, f), ctx.currentTime);
      bp.Q.setValueAtTime(24, ctx.currentTime);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, ctx.currentTime);
      g.connect(bp);
      bp.connect(mix);
      this.filters.push(bp);
      this.droneGains.push(g);
    });

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 2, true);
    noise.loop = true;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.06, ctx.currentTime);
    noise.connect(nGain);
    this.filters.forEach((bp, i) => {
      nGain.connect(bp);
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime((freqs[i] / 2), ctx.currentTime);
      osc.connect(this.droneGains[i]);
      osc.start();
    });

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(32.7, ctx.currentTime);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.15, ctx.currentTime);
    sub.connect(subGain);
    subGain.connect(mix);

    this.noise = noise;
    this.sub = sub;
    this.noiseGain = nGain;

    return {
      ...base,
      dispose: () => {
        try { mix.disconnect(); } catch {}
        try { shaper.disconnect(); } catch {}
        try { comp.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override start(): void {
    if (!this.ctx || this.started || !this.noise || !this.sub) return;
    this.started = true;
    const now = this.ctx.currentTime;
    try { this.noise.start(now); } catch {}
    try { this.sub.start(now); } catch {}

    const id = window.setInterval(() => {
      if (!this.ctx) return;
      const chars = [' ', '.', ':', 'x', '#', '@'];
      let active = 0;
      let flux = 0;
      const columnDensity = new Array(12).fill(0);
      this.matrixValues = this.matrixValues.map((row) => row.map((value, c) => {
        const drift = (Math.random() - 0.5) * 0.24;
        const next = Math.max(0, Math.min(1, value + drift));
        flux += Math.abs(drift);
        columnDensity[c] += next;
        if (next > 0.62) active += 1;
        return next;
      }));
      this.matrix = this.matrixValues.map((row) => row.map((v) => {
        const idx = Math.min(chars.length - 1, Math.floor(v * chars.length));
        return chars[idx];
      }).join(''));
      this.activeCells = active;
      this.roomFlux = Number((flux / 144).toFixed(4));
      this.pressure = Number((active / 144).toFixed(2));
      const t = this.ctx.currentTime;
      columnDensity.forEach((d, i) => {
        const density = d / 12;
        this.droneGains[i].gain.setTargetAtTime(0.03 + (density * 0.2), t, 0.15);
        this.filters[i].Q.setTargetAtTime(6 + (density * 60), t, 0.15);
      });
      if (this.noiseGain) {
        this.noiseGain.gain.setTargetAtTime(0.04 + (this.pressure * 0.2), t, 0.2);
      }
    }, 150);
    this.trackInterval(id);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.2);
    const id = window.setTimeout(() => {
      try { this.noise?.stop(); } catch {}
      try { this.sub?.stop(); } catch {}
      this.started = false;
    }, 260);
    this.trackTimeout(id as unknown as number);
    super.stop();
  }

  protected override activateFallback(): void {
    if (!this.ctx || !this.noiseGain) return;
    this.noiseGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.1);
  }

  public override getDiagnostics(): EnvironDiagnostics {
    return {
      ...this.contract,
      matrix: [...this.matrix],
      activeCells: this.activeCells,
      roomFlux: this.roomFlux,
      pressure: this.pressure,
    };
  }
}

class MemoryEngine extends BaseModeEngine<MemoryDiagnostics> {
  private sourceType: 'MIC' | 'FALLBACK' = 'FALLBACK';
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micPre: GainNode | null = null;
  private inputBus!: GainNode;
  private analyser!: AnalyserNode;
  private feedbackDelay!: DelayNode;
  private feedbackGain!: GainNode;
  private memoryDelay!: DelayNode;
  private memoryFeedback!: GainNode;
  private hallConvolver!: ConvolverNode;
  private hallWet!: GainNode;
  private hallDry!: GainNode;
  private grainRate = 0;
  private feedback = 0.2;
  private ghostUntil = 0;
  private f0 = 110;
  private memorySec = 10;
  private reverbMix = 0.28;
  private rms = 0;
  private fallbackNoiseGain: GainNode | null = null;
  private roomNoiseSource: AudioBufferSourceNode | null = null;
  private started = false;

  constructor() {
    super(Mode.MEMORY);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    this.inputBus = ctx.createGain();
    this.inputBus.gain.setValueAtTime(1, ctx.currentTime);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(110, ctx.currentTime);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(520, ctx.currentTime);
    bp.Q.setValueAtTime(8, ctx.currentTime);

    this.feedbackDelay = ctx.createDelay(3.0);
    this.feedbackDelay.delayTime.setValueAtTime(0.24, ctx.currentTime);
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.setValueAtTime(this.feedback, ctx.currentTime);
    this.memoryDelay = ctx.createDelay(24.0);
    this.memoryDelay.delayTime.setValueAtTime(this.memorySec, ctx.currentTime);
    this.memoryFeedback = ctx.createGain();
    this.memoryFeedback.gain.setValueAtTime(0.48, ctx.currentTime);
    this.hallConvolver = ctx.createConvolver();
    this.hallConvolver.buffer = createImpulseResponse(ctx, 6.5, 3.1);
    this.hallWet = ctx.createGain();
    this.hallWet.gain.setValueAtTime(this.reverbMix, ctx.currentTime);
    this.hallDry = ctx.createGain();
    this.hallDry.gain.setValueAtTime(1 - this.reverbMix, ctx.currentTime);
    const blend = ctx.createGain();
    blend.gain.setValueAtTime(0.66, ctx.currentTime);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.inputBus.connect(hp);
    hp.connect(bp);
    bp.connect(this.feedbackDelay);
    this.feedbackDelay.connect(this.feedbackGain);
    this.feedbackGain.connect(bp);
    bp.connect(this.memoryDelay);
    this.memoryDelay.connect(this.memoryFeedback);
    this.memoryFeedback.connect(this.memoryDelay);
    bp.connect(this.hallDry);
    this.feedbackDelay.connect(this.hallDry);
    this.memoryDelay.connect(this.hallDry);
    bp.connect(this.hallConvolver);
    this.feedbackDelay.connect(this.hallConvolver);
    this.memoryDelay.connect(this.hallConvolver);
    this.hallConvolver.connect(this.hallWet);
    this.hallDry.connect(blend);
    this.hallWet.connect(blend);
    blend.connect(this.analyser);
    this.analyser.connect(this.output);

    const roomNoise = ctx.createBufferSource();
    roomNoise.buffer = createNoiseBuffer(ctx, 2, true);
    roomNoise.loop = true;
    const roomNoiseGain = ctx.createGain();
    roomNoiseGain.gain.setValueAtTime(0.012, ctx.currentTime);
    roomNoise.connect(roomNoiseGain);
    roomNoiseGain.connect(this.inputBus);
    this.roomNoiseSource = roomNoise;

    const fallbackNoise = ctx.createBufferSource();
    fallbackNoise.buffer = createNoiseBuffer(ctx, 2, false);
    fallbackNoise.loop = true;
    const fallbackNoiseGain = ctx.createGain();
    fallbackNoiseGain.gain.setValueAtTime(0, ctx.currentTime);
    fallbackNoise.connect(fallbackNoiseGain);
    fallbackNoiseGain.connect(this.inputBus);
    this.fallbackNoiseGain = fallbackNoiseGain;

    this.trackTimeout(window.setTimeout(() => {
      try { roomNoise.start(); } catch {}
      try { fallbackNoise.start(); } catch {}
    }, 0) as unknown as number);

    return {
      ...base,
      dispose: () => {
        try { hp.disconnect(); } catch {}
        try { bp.disconnect(); } catch {}
        try { this.feedbackDelay.disconnect(); } catch {}
        try { this.feedbackGain.disconnect(); } catch {}
        try { this.memoryDelay.disconnect(); } catch {}
        try { this.memoryFeedback.disconnect(); } catch {}
        try { this.hallConvolver.disconnect(); } catch {}
        try { this.hallWet.disconnect(); } catch {}
        try { this.hallDry.disconnect(); } catch {}
        try { blend.disconnect(); } catch {}
        try { this.analyser.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override async start(): Promise<void> {
    if (!this.ctx || this.started) return;
    this.started = true;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micPre = this.ctx.createGain();
      this.micPre.gain.setValueAtTime(1.6, this.ctx.currentTime);
      this.micSource.connect(this.micPre);
      this.micPre.connect(this.inputBus);
      this.sourceType = 'MIC';
    } catch {
      this.ensureFallback('MIC_DENIED');
    }

    const diagId = window.setInterval(() => {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      this.rms = Math.sqrt(sum / data.length);
      this.grainRate = Math.max(3, Math.round(4 + (this.rms * 140)));
    }, 120);
    this.trackInterval(diagId);

    let idx = 0;
    const stepId = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.f0 = [98, 110, 123, 131, 147, 165][idx % 6];
      this.feedbackDelay.delayTime.setTargetAtTime(0.12 + ((idx % 4) * 0.07), t, 0.09);
      this.feedback = 0.14 + (((idx % 3) * 0.08) + (this.rms * 0.7));
      this.feedbackGain.gain.setTargetAtTime(Math.min(0.82, this.feedback), t, 0.12);
      const lengthTarget = 8 + ((idx % 6) * 2.2) + Math.min(6, this.rms * 30);
      this.memorySec = Number(lengthTarget.toFixed(1));
      this.memoryDelay.delayTime.setTargetAtTime(Math.min(22, this.memorySec), t, 0.22);
      const longFb = Math.min(0.78, 0.34 + (this.rms * 1.1));
      this.memoryFeedback.gain.setTargetAtTime(longFb, t, 0.18);
      const reverbTarget = Math.min(0.66, 0.2 + (this.rms * 2.8));
      this.reverbMix = Number(reverbTarget.toFixed(2));
      this.hallWet.gain.setTargetAtTime(this.reverbMix, t, 0.2);
      this.hallDry.gain.setTargetAtTime(1 - this.reverbMix, t, 0.2);
      idx += 1;
      if (Math.random() > 0.76) {
        const ghostDur = 0.5 + (Math.random() * 0.9);
        this.ghostUntil = t + ghostDur;
        this.feedbackGain.gain.setTargetAtTime(Math.min(0.92, this.feedback + 0.12), t, 0.02);
        this.memoryFeedback.gain.setTargetAtTime(Math.min(0.86, longFb + 0.08), t, 0.06);
      }
      if (this.sourceType === 'FALLBACK' && this.fallbackNoiseGain) {
        const pulse = 0.045 + (Math.random() * 0.04);
        this.fallbackNoiseGain.gain.setTargetAtTime(pulse, t, 0.08);
      }
      this.output.gain.setTargetAtTime(0.7 + ((idx % 2) * 0.08), t, 0.1);
    }, 420);
    this.trackInterval(stepId);
  }

  public override setParams(params: Record<string, unknown>): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (params.memoryProfile === 'SHORT') {
      this.memorySec = 6.5;
    } else if (params.memoryProfile === 'LONG') {
      this.memorySec = 18;
    }
    if (typeof params.memorySec === 'number') {
      this.memorySec = Math.max(4, Math.min(22, params.memorySec));
    }
    if (params.hall === 'LOW') {
      this.reverbMix = 0.18;
    } else if (params.hall === 'MID') {
      this.reverbMix = 0.32;
    } else if (params.hall === 'HIGH') {
      this.reverbMix = 0.52;
    }
    if (typeof params.reverbMix === 'number') {
      this.reverbMix = Math.max(0.05, Math.min(0.75, params.reverbMix));
    }
    this.memoryDelay.delayTime.setTargetAtTime(this.memorySec, t, 0.18);
    this.hallWet.gain.setTargetAtTime(this.reverbMix, t, 0.2);
    this.hallDry.gain.setTargetAtTime(1 - this.reverbMix, t, 0.2);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.24);
    const id = window.setTimeout(() => {
      try { this.roomNoiseSource?.stop(); } catch {}
      try { this.micStream?.getTracks().forEach((track) => track.stop()); } catch {}
      try { this.micPre?.disconnect(); } catch {}
      this.started = false;
    }, 280);
    this.trackTimeout(id as unknown as number);
    super.stop();
  }

  protected override activateFallback(): void {
    if (!this.ctx) return;
    this.sourceType = 'FALLBACK';
    if (this.fallbackNoiseGain) {
      this.fallbackNoiseGain.gain.setTargetAtTime(0.065, this.ctx.currentTime, 0.12);
    }
    this.memoryFeedback.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.12);
    this.hallWet.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.12);
    this.hallDry.gain.setTargetAtTime(0.58, this.ctx.currentTime, 0.12);
  }

  public override getDiagnostics(): MemoryDiagnostics {
    return {
      ...this.contract,
      rms: Number(this.rms.toFixed(3)),
      source: this.sourceType,
      grainRate: this.grainRate,
      feedback: Number(this.feedback.toFixed(2)),
      ghostUntil: Math.max(0, Math.ceil(this.ghostUntil - (this.ctx?.currentTime ?? 0))),
      f0: this.f0,
      memorySec: this.memorySec,
      reverbMix: this.reverbMix,
    };
  }
}

class GenerativeEngine extends BaseModeEngine<GenerativeDiagnostics> {
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private analyser!: AnalyserNode;
  private rows: number[][] = [];
  private rowsAscii: string[] = Array.from({ length: 18 }, () => '.'.repeat(14));
  private rule: 30 | 110 = 110;
  private invert = false;
  private bandAmps = new Array(7).fill(0);
  private started = false;

  constructor() {
    super(Mode.GENERATIVE);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime);
    const feedback = ctx.createGain();
    feedback.gain.setValueAtTime(0.08, ctx.currentTime);
    filter.connect(feedback);
    feedback.connect(filter);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    filter.connect(this.analyser);
    this.analyser.connect(this.output);

    [110, 165, 220, 330, 440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      osc.connect(gain);
      gain.connect(filter);
      this.oscillators.push(osc);
      this.gains.push(gain);
    });

    return {
      ...base,
      dispose: () => {
        try { filter.disconnect(); } catch {}
        try { feedback.disconnect(); } catch {}
        try { this.analyser.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override start(): void {
    if (!this.ctx || this.started) return;
    this.started = true;
    this.rows = [new Array(14).fill(0).map((_, i) => (i === 7 ? 1 : 0))];
    this.oscillators.forEach((osc) => { try { osc.start(); } catch {} });

    const caId = window.setInterval(() => {
      const prev = this.rows[this.rows.length - 1];
      const next = new Array(14).fill(0);
      const bits = this.rule.toString(2).padStart(8, '0').split('').reverse().map(Number);
      for (let c = 0; c < 14; c += 1) {
        const left = prev[(c + 13) % 14];
        const mid = prev[c];
        const right = prev[(c + 1) % 14];
        const pattern = (left << 2) | (mid << 1) | right;
        const value = bits[pattern];
        next[c] = this.invert ? (value ? 0 : 1) : value;
      }
      this.rows.push(next);
      if (this.rows.length > 18) this.rows.shift();
      const chars = ['.', ':', 'x', '#'];
      this.rowsAscii = this.rows.map((row) => row.map((cell, i) => {
        if (!cell) return '.';
        const amp = this.bandAmps[Math.min(6, Math.floor(i / 2))];
        const idx = Math.min(chars.length - 1, Math.floor(amp * chars.length));
        return chars[idx];
      }).join(''));
      const density = next.reduce((acc, v) => acc + v, 0) / next.length;
      if (this.ctx) {
        const t = this.ctx.currentTime;
        this.gains.forEach((g, i) => {
          const gate = next[(i * 2) % next.length];
          g.gain.setTargetAtTime((gate ? 0.07 : 0.02) + (density * 0.08), t, 0.08);
        });
      }
    }, 150);
    this.trackInterval(caId);

    const ampId = window.setInterval(() => {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const bucket = Math.floor(data.length / 7);
      this.bandAmps = new Array(7).fill(0).map((_, i) => {
        let sum = 0;
        const start = i * bucket;
        const end = i === 6 ? data.length : (i + 1) * bucket;
        for (let j = start; j < end; j += 1) sum += data[j];
        return Number(((sum / Math.max(1, end - start)) / 255).toFixed(2));
      });
    }, 120);
    this.trackInterval(ampId);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.2);
    const id = window.setTimeout(() => {
      this.oscillators.forEach((osc) => { try { osc.stop(); } catch {} });
      this.started = false;
    }, 250);
    this.trackTimeout(id as unknown as number);
    super.stop();
  }

  public override setParams(params: Record<string, unknown>): void {
    if (params.rule === 30 || params.rule === 110) this.rule = params.rule;
    if (typeof params.invert === 'boolean') this.invert = params.invert;
  }

  protected override activateFallback(): void {
    if (!this.ctx) return;
    this.gains.forEach((g, i) => g.gain.setTargetAtTime(0.04 + (i * 0.005), this.ctx.currentTime, 0.08));
  }

  public override getDiagnostics(): GenerativeDiagnostics {
    return {
      ...this.contract,
      rows: [...this.rowsAscii],
      rule: this.rule,
      invert: this.invert,
      bandAmps: [...this.bandAmps],
    };
  }
}

class OracleEngine extends BaseModeEngine<OracleDiagnostics> {
  private sourceType: 'MIC' | 'FALLBACK' = 'FALLBACK';
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private inputBus!: GainNode;
  private analyser!: AnalyserNode;
  private fallbackNoiseGain: GainNode | null = null;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private droneAGain: GainNode | null = null;
  private droneBGain: GainNode | null = null;
  private tapeNoise: AudioBufferSourceNode | null = null;
  private tapeGain: GainNode | null = null;
  private concretePulse: AudioBufferSourceNode | null = null;
  private concreteDryGain: GainNode | null = null;
  private concreteResonators: BiquadFilterNode[] = [];
  private resonatorMix: GainNode | null = null;
  private concreteDelay: DelayNode | null = null;
  private concreteFeedback: GainNode | null = null;
  private hexagram = [0, 0, 0, 0, 0, 0];
  private text = 'LISTEN_FOR_EVENT';
  private rms = 0;
  private highSens = false;
  private concreteIntensity: IntensityLevel = 'PRESENT';
  private started = false;
  private phaseStep = 0;
  private densityGlyph: '░' | '▒' | '▓' | '█' = '░';
  private matrix24x8 = Array.from({ length: 8 }, () => '.'.repeat(24));
  private readonly driftSeq = [55, 61, 73, 82, 98, 110, 123, 147];
  private driftIndex = 0;

  constructor() {
    super(Mode.ORACLE);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    this.inputBus = ctx.createGain();
    this.inputBus.gain.setValueAtTime(1, ctx.currentTime);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(90, ctx.currentTime);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(clampHz(ctx, 7200), ctx.currentTime);
    const sat = ctx.createWaveShaper();
    const satCurve = new Float32Array(2048);
    const drive = 8;
    for (let i = 0; i < satCurve.length; i += 1) {
      const x = (i * 2 / satCurve.length) - 1;
      satCurve[i] = ((Math.PI + drive) * x) / (Math.PI + (drive * Math.abs(x)));
    }
    sat.curve = satCurve;
    sat.oversample = '2x';
    this.inputBus.connect(hp);
    hp.connect(lp);
    lp.connect(sat);
    sat.connect(this.analyser);
    this.analyser.connect(this.output);

    this.droneA = ctx.createOscillator();
    this.droneA.type = 'triangle';
    this.droneA.frequency.setValueAtTime(55, ctx.currentTime);
    this.droneAGain = ctx.createGain();
    this.droneAGain.gain.setValueAtTime(0.04, ctx.currentTime);
    this.droneA.connect(this.droneAGain);
    this.droneAGain.connect(this.inputBus);

    this.droneB = ctx.createOscillator();
    this.droneB.type = 'sawtooth';
    this.droneB.frequency.setValueAtTime(82, ctx.currentTime);
    this.droneBGain = ctx.createGain();
    this.droneBGain.gain.setValueAtTime(0.02, ctx.currentTime);
    this.droneB.connect(this.droneBGain);
    this.droneBGain.connect(this.inputBus);

    this.tapeNoise = ctx.createBufferSource();
    this.tapeNoise.buffer = createNoiseBuffer(ctx, 3, true);
    this.tapeNoise.loop = true;
    const tapeHp = ctx.createBiquadFilter();
    tapeHp.type = 'highpass';
    tapeHp.frequency.setValueAtTime(360, ctx.currentTime);
    const tapeLp = ctx.createBiquadFilter();
    tapeLp.type = 'lowpass';
    tapeLp.frequency.setValueAtTime(clampHz(ctx, 3800), ctx.currentTime);
    this.tapeGain = ctx.createGain();
    this.tapeGain.gain.setValueAtTime(0.026, ctx.currentTime);
    this.tapeNoise.connect(tapeHp);
    tapeHp.connect(tapeLp);
    tapeLp.connect(this.tapeGain);
    this.tapeGain.connect(this.inputBus);

    const pulseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const pulseData = pulseBuffer.getChannelData(0);
    pulseData.fill(0);
    for (let i = 0; i < pulseData.length; i += 1) {
      if (Math.random() > 0.9965) {
        pulseData[i] = (Math.random() * 2) - 1;
      }
    }
    this.concretePulse = ctx.createBufferSource();
    this.concretePulse.buffer = pulseBuffer;
    this.concretePulse.loop = true;
    this.concreteDryGain = ctx.createGain();
    this.concreteDryGain.gain.setValueAtTime(0.06, ctx.currentTime);
    this.concretePulse.connect(this.concreteDryGain);
    this.concreteDryGain.connect(this.inputBus);

    this.resonatorMix = ctx.createGain();
    this.resonatorMix.gain.setValueAtTime(0.18, ctx.currentTime);
    const resonF = [210, 320, 470, 710, 980, 1420];
    resonF.forEach((freq) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(clampHz(ctx, freq), ctx.currentTime);
      bp.Q.setValueAtTime(22, ctx.currentTime);
      this.concretePulse?.connect(bp);
      bp.connect(this.resonatorMix!);
      this.concreteResonators.push(bp);
    });

    this.concreteDelay = ctx.createDelay(1.4);
    this.concreteDelay.delayTime.setValueAtTime(0.21, ctx.currentTime);
    this.concreteFeedback = ctx.createGain();
    this.concreteFeedback.gain.setValueAtTime(0.28, ctx.currentTime);
    this.resonatorMix.connect(this.concreteDelay);
    this.concreteDelay.connect(this.concreteFeedback);
    this.concreteFeedback.connect(this.concreteDelay);
    this.resonatorMix.connect(this.inputBus);
    this.concreteDelay.connect(this.inputBus);

    const fallbackNoise = ctx.createBufferSource();
    fallbackNoise.buffer = createNoiseBuffer(ctx, 2, true);
    fallbackNoise.loop = true;
    const fallbackGain = ctx.createGain();
    fallbackGain.gain.setValueAtTime(0, ctx.currentTime);
    fallbackNoise.connect(fallbackGain);
    fallbackGain.connect(this.inputBus);
    this.fallbackNoiseGain = fallbackGain;

    this.trackTimeout(window.setTimeout(() => {
      try { this.droneA?.start(); } catch {}
      try { this.droneB?.start(); } catch {}
      try { this.tapeNoise?.start(); } catch {}
      try { this.concretePulse?.start(); } catch {}
      try { fallbackNoise.start(); } catch {}
    }, 0) as unknown as number);

    return {
      ...base,
      dispose: () => {
        try { this.inputBus.disconnect(); } catch {}
        try { hp.disconnect(); } catch {}
        try { lp.disconnect(); } catch {}
        try { sat.disconnect(); } catch {}
        try { this.analyser.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override async start(): Promise<void> {
    if (!this.ctx || this.started) return;
    this.started = true;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micGain = this.ctx.createGain();
      this.micGain.gain.setValueAtTime(this.highSens ? 6.8 : 4.2, this.ctx.currentTime);
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.inputBus);
      this.sourceType = 'MIC';
    } catch {
      this.ensureFallback('MIC_DENIED');
    }

    const diagId = window.setInterval(() => {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      this.rms = Math.sqrt(sum / data.length);
      this.updateAsciiMatrix();
      const threshold = this.highSens ? 0.02 : 0.045;
      if (this.rms > threshold && Math.random() > 0.82) {
        this.throwCoins();
      }
    }, 140);
    this.trackInterval(diagId);

    const stepId = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.driftIndex = (this.driftIndex + 1) % this.driftSeq.length;
      const base = this.driftSeq[this.driftIndex];
      this.droneA?.frequency.setTargetAtTime(base, t, 0.1);
      this.droneB?.frequency.setTargetAtTime(base * (1.48 + ((this.driftIndex % 3) * 0.07)), t, 0.1);

      const densityFactor = this.densityGlyph === '░' ? 0.2 : this.densityGlyph === '▒' ? 0.45 : this.densityGlyph === '▓' ? 0.7 : 1.0;
      const intensityScale = this.concreteIntensity === 'CALM' ? 0.55 : this.concreteIntensity === 'PRESENT' ? 1 : 1.45;
      this.droneAGain?.gain.setTargetAtTime((0.035 + (densityFactor * 0.022)) * intensityScale, t, 0.08);
      this.droneBGain?.gain.setTargetAtTime((0.015 + (densityFactor * 0.02)) * intensityScale, t, 0.08);
      this.tapeGain?.gain.setTargetAtTime((0.02 + (densityFactor * 0.035)) * intensityScale, t, 0.08);
      this.concreteDryGain?.gain.setTargetAtTime((0.03 + (densityFactor * 0.06)) * intensityScale, t, 0.08);
      this.concreteDelay?.delayTime.setTargetAtTime(0.12 + ((this.driftIndex % 5) * 0.05), t, 0.12);
      this.concreteFeedback?.gain.setTargetAtTime(Math.min(0.84, (0.22 + (densityFactor * 0.32)) * (0.8 + (0.4 * intensityScale))), t, 0.12);
      this.concreteResonators.forEach((bp, i) => {
        const spread = 0.25 + (0.2 * intensityScale);
        const targetF = clampHz(this.ctx!, (190 + (i * 140)) * (0.9 + (Math.random() * spread)));
        bp.frequency.setTargetAtTime(targetF, t, 0.14);
      });
      this.phaseStep = (this.phaseStep + 1) % 1000;
      if (Math.random() > 0.92) {
        this.text = ['ROOM_TRACE', 'TAPE_MEMORY', 'CONCRETE_DRIFT', 'I_CHING_NOISE'][Math.floor(Math.random() * 4)];
      }
    }, 260);
    this.trackInterval(stepId);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.2);
    const id = window.setTimeout(() => {
      try { this.droneA?.stop(); } catch {}
      try { this.droneB?.stop(); } catch {}
      try { this.tapeNoise?.stop(); } catch {}
      try { this.concretePulse?.stop(); } catch {}
      try { this.micStream?.getTracks().forEach((track) => track.stop()); } catch {}
      this.started = false;
    }, 260);
    this.trackTimeout(id as unknown as number);
    super.stop();
  }

  public override setParams(params: Record<string, unknown>): void {
    if (typeof params.highSens === 'boolean') {
      this.highSens = params.highSens;
      if (this.ctx && this.micGain) {
        this.micGain.gain.setTargetAtTime(this.highSens ? 6.8 : 4.2, this.ctx.currentTime, 0.12);
      }
    }
    if (params.concreteIntensity === 'CALM' || params.concreteIntensity === 'PRESENT' || params.concreteIntensity === 'HAUNTED') {
      this.concreteIntensity = params.concreteIntensity;
    }
    if (params.throw === true) this.throwCoins();
  }

  private throwCoins(): void {
    this.hexagram = new Array(6).fill(0).map(() => (Math.random() > 0.5 ? 1 : 0));
    const phrases = ['WAITING_FOR_EVENT', 'NON_INTENTIONALITY', 'CHANCE_DETERMINANT', 'LISTENING_IS_ACTION'];
    this.text = phrases[Math.floor(Math.random() * phrases.length)];
  }

  protected override activateFallback(): void {
    if (!this.ctx) return;
    this.sourceType = 'FALLBACK';
    this.fallbackNoiseGain?.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.12);
    this.tapeGain?.gain.setTargetAtTime(0.065, this.ctx.currentTime, 0.1);
    this.concreteDryGain?.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.1);
  }

  private updateAsciiMatrix(): void {
    const freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(freq);
    const rows = 8;
    const cols = 24;
    const glyphs = [' ', '.', ':', '░', '▒', '▓', '█'];
    const binStep = Math.max(1, Math.floor(freq.length / cols));
    const shift = this.phaseStep % cols;
    const next: string[] = [];
    let total = 0;
    for (let r = 0; r < rows; r += 1) {
      let line = '';
      for (let c = 0; c < cols; c += 1) {
        const srcCol = (c + shift) % cols;
        const start = srcCol * binStep;
        const end = Math.min(freq.length, start + binStep);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += freq[i];
        const avg = (sum / Math.max(1, end - start)) / 255;
        total += avg;
        const threshold = (rows - r) / rows;
        const level = Math.max(0, avg - (threshold * 0.38));
        const idx = Math.min(glyphs.length - 1, Math.floor(level * 8));
        line += glyphs[idx];
      }
      next.push(line);
    }
    const density = total / (rows * cols);
    this.densityGlyph = density < 0.12 ? '░' : density < 0.2 ? '▒' : density < 0.3 ? '▓' : '█';
    this.matrix24x8 = next;
  }

  public override getDiagnostics(): OracleDiagnostics {
    return {
      ...this.contract,
      rms: Number(this.rms.toFixed(3)),
      source: this.sourceType,
      hexagram: [...this.hexagram],
      text: this.text,
      matrix24x8: [...this.matrix24x8],
      densityGlyph: this.densityGlyph,
      phaseStep: this.phaseStep,
      concreteIntensity: this.concreteIntensity,
    };
  }
}

type KHSMoment = {
  bias: SpectralBias;
  density: 1 | 2 | 3 | 4;
  width: number;
  partials: number;
  noise: number;
  durationSec: number;
  transitionSec: number;
};

class KHSEngine extends BaseModeEngine<KHSDiagnostics> {
  private partials: Array<{ osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; base: number }> = [];
  private shortwaveNoise: AudioBufferSourceNode | null = null;
  private shortwaveFilter!: BiquadFilterNode;
  private shortwaveGain!: GainNode;
  private analyser!: AnalyserNode;
  private emphasis!: BiquadFilterNode;
  private lowpass!: BiquadFilterNode;
  private moments: KHSMoment[] = [];
  private currentMoment = 0;
  private momentStart = 0;
  private momentEnd = 0;
  private momentTransition = 0;
  private matrix24x8 = Array.from({ length: 8 }, () => '.'.repeat(24));
  private colMap = Array.from({ length: 24 }, (_, i) => i);
  private started = false;

  constructor() {
    super(Mode.KHS);
  }

  public override createGraph(ctx: AudioContext): ModeGraph {
    const base = super.createGraph(ctx);
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.9, ctx.currentTime);

    const ratios = [1, 1.05, 1.12, 1.19, 1.25, 1.33, 1.41, 1.5, 1.62, 1.78, 1.88, 2, 2.13, 2.25];
    ratios.forEach((ratio) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const baseFreq = 43.2 * ratio;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0025, ctx.currentTime);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(mix);
      this.partials.push({ osc, gain, pan, base: baseFreq });
    });

    this.shortwaveNoise = ctx.createBufferSource();
    this.shortwaveNoise.buffer = createNoiseBuffer(ctx, 2, true);
    this.shortwaveNoise.loop = true;
    this.shortwaveFilter = ctx.createBiquadFilter();
    this.shortwaveFilter.type = 'bandpass';
    this.shortwaveFilter.frequency.setValueAtTime(1400, ctx.currentTime);
    this.shortwaveFilter.Q.setValueAtTime(10, ctx.currentTime);
    this.shortwaveGain = ctx.createGain();
    this.shortwaveGain.gain.setValueAtTime(0.05, ctx.currentTime);
    this.shortwaveNoise.connect(this.shortwaveFilter);
    this.shortwaveFilter.connect(this.shortwaveGain);
    this.shortwaveGain.connect(mix);

    this.emphasis = ctx.createBiquadFilter();
    this.emphasis.type = 'peaking';
    this.emphasis.frequency.setValueAtTime(clampHz(ctx, 600), ctx.currentTime);
    this.emphasis.Q.setValueAtTime(2.5, ctx.currentTime);
    this.emphasis.gain.setValueAtTime(3, ctx.currentTime);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.setValueAtTime(clampHz(ctx, 6000), ctx.currentTime);

    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    const drive = 12;
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i * 2 / curve.length) - 1;
      curve[i] = ((Math.PI + drive) * x) / (Math.PI + (drive * Math.abs(x)));
    }
    sat.curve = curve;
    sat.oversample = '4x';

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;

    mix.connect(this.emphasis);
    this.emphasis.connect(this.lowpass);
    this.lowpass.connect(sat);
    sat.connect(this.analyser);
    this.analyser.connect(this.output);

    return {
      ...base,
      dispose: () => {
        try { mix.disconnect(); } catch {}
        try { this.shortwaveFilter.disconnect(); } catch {}
        try { this.shortwaveGain.disconnect(); } catch {}
        try { this.emphasis.disconnect(); } catch {}
        try { this.lowpass.disconnect(); } catch {}
        try { this.analyser.disconnect(); } catch {}
        super.stop();
      },
    };
  }

  public override start(): void {
    if (!this.ctx || this.started) return;
    this.started = true;
    this.partials.forEach(({ osc }) => { try { osc.start(); } catch {} });
    try { this.shortwaveNoise?.start(); } catch {}
    this.moments = this.buildMoments();
    this.currentMoment = 0;
    this.applyMoment(this.moments[this.currentMoment], true);

    const momentId = window.setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now >= this.momentEnd) {
        this.currentMoment = (this.currentMoment + 1) % this.moments.length;
        this.applyMoment(this.moments[this.currentMoment], false);
      }
    }, 1000);
    this.trackInterval(momentId);

    const swId = window.setInterval(() => {
      if (!this.ctx) return;
      const target = clampHz(this.ctx, 480 + (Math.random() * 5200));
      const t = this.ctx.currentTime;
      this.shortwaveFilter.frequency.setTargetAtTime(target, t, 0.22);
      this.shortwaveFilter.Q.setTargetAtTime(7 + (Math.random() * 9), t, 0.22);
    }, 320);
    this.trackInterval(swId);

    const matrixId = window.setInterval(() => {
      this.updateMatrix();
    }, 125);
    this.trackInterval(matrixId);
  }

  public override stop(): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + 0.25);
    const id = window.setTimeout(() => {
      this.partials.forEach(({ osc }) => { try { osc.stop(); } catch {} });
      try { this.shortwaveNoise?.stop(); } catch {}
      this.started = false;
    }, 300);
    this.trackTimeout(id as unknown as number);
    super.stop();
  }

  public override setParams(params: Record<string, unknown>): void {
    if (typeof params.forceMoment === 'number' && this.moments.length > 0) {
      const idx = Math.max(0, Math.min(this.moments.length - 1, Math.floor(params.forceMoment)));
      this.currentMoment = idx;
      this.applyMoment(this.moments[this.currentMoment], false);
    }
  }

  private buildMoments(): KHSMoment[] {
    const total = 12;
    const pattern: SpectralBias[] = ['LOW', 'MID', 'HIGH', 'LOW', 'MID', 'HIGH', 'LOW', 'MID', 'HIGH', 'LOW', 'MID', 'HIGH'];
    return new Array(total).fill(0).map((_, i) => ({
      bias: pattern[i],
      density: (1 + (i % 4)) as 1 | 2 | 3 | 4,
      width: 0.12 + (((i * 17) % 70) / 100),
      partials: 4 + ((i * 3) % 9),
      noise: 0.04 + ((i % 5) * 0.03),
      durationSec: 60 + Math.floor(Math.random() * 121),
      transitionSec: 20 + Math.floor(Math.random() * 41),
    }));
  }

  private applyMoment(moment: KHSMoment, immediate: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.momentStart = now;
    this.momentTransition = immediate ? 0.1 : moment.transitionSec;
    this.momentEnd = now + moment.durationSec;
    const transition = immediate ? 0.1 : moment.transitionSec;
    const width = moment.width;
    const densityScale = moment.density / 4;

    this.partials.forEach((partial, i) => {
      const position = i / Math.max(1, this.partials.length - 1);
      const lowWeight = 1 - position;
      const highWeight = position;
      const midWeight = 1 - Math.abs((position - 0.5) * 2);
      const biasWeight = moment.bias === 'LOW' ? lowWeight : moment.bias === 'MID' ? midWeight : highWeight;
      const active = i < moment.partials;
      const targetGain = active ? (0.002 + (biasWeight * densityScale * 0.05)) : 0.0002;
      const targetFreq = partial.base * (1 + ((Math.random() * 0.02) - 0.01));
      const targetPan = ((Math.random() * 2) - 1) * width;
      partial.gain.gain.cancelScheduledValues(now);
      partial.gain.gain.setValueAtTime(partial.gain.gain.value, now);
      partial.gain.gain.linearRampToValueAtTime(targetGain, now + transition);
      partial.osc.frequency.cancelScheduledValues(now);
      partial.osc.frequency.setValueAtTime(partial.osc.frequency.value, now);
      partial.osc.frequency.linearRampToValueAtTime(clampHz(this.ctx, targetFreq), now + transition);
      partial.pan.pan.cancelScheduledValues(now);
      partial.pan.pan.setValueAtTime(partial.pan.pan.value, now);
      partial.pan.pan.linearRampToValueAtTime(targetPan, now + transition);
    });

    const emphasisHz = moment.bias === 'LOW' ? 260 : moment.bias === 'MID' ? 1200 : 4200;
    this.emphasis.frequency.cancelScheduledValues(now);
    this.emphasis.frequency.setValueAtTime(this.emphasis.frequency.value, now);
    this.emphasis.frequency.linearRampToValueAtTime(clampHz(this.ctx, emphasisHz), now + transition);
    this.emphasis.Q.cancelScheduledValues(now);
    this.emphasis.Q.setValueAtTime(this.emphasis.Q.value, now);
    this.emphasis.Q.linearRampToValueAtTime(2 + (moment.density * 0.9), now + transition);
    this.emphasis.gain.cancelScheduledValues(now);
    this.emphasis.gain.setValueAtTime(this.emphasis.gain.value, now);
    this.emphasis.gain.linearRampToValueAtTime(2 + (moment.density * 1.7), now + transition);

    const lpTarget = moment.bias === 'HIGH' ? 9500 : moment.bias === 'MID' ? 6800 : 3800;
    this.lowpass.frequency.cancelScheduledValues(now);
    this.lowpass.frequency.setValueAtTime(this.lowpass.frequency.value, now);
    this.lowpass.frequency.linearRampToValueAtTime(clampHz(this.ctx, lpTarget), now + transition);

    this.shortwaveGain.gain.cancelScheduledValues(now);
    this.shortwaveGain.gain.setValueAtTime(this.shortwaveGain.gain.value, now);
    this.shortwaveGain.gain.linearRampToValueAtTime(moment.noise, now + transition);

    this.rebuildColMap(this.currentMoment);
  }

  private rebuildColMap(seed: number): void {
    const arr = Array.from({ length: 24 }, (_, i) => i);
    let x = (seed + 1) * 7919;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      x = (x * 48271) % 2147483647;
      const j = x % (i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    this.colMap = arr;
  }

  private updateMatrix(): void {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const glyphs = [' ', '.', ':', '░', '▒', '▓', '█'];
    const rows = 8;
    const cols = 24;
    const next: string[] = [];
    const binStep = Math.max(1, Math.floor(data.length / cols));
    for (let r = 0; r < rows; r += 1) {
      let line = '';
      for (let c = 0; c < cols; c += 1) {
        const mappedCol = this.colMap[c];
        const start = mappedCol * binStep;
        const end = Math.min(data.length, start + binStep);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += data[i];
        const avg = (sum / Math.max(1, end - start)) / 255;
        const threshold = (rows - r) / rows;
        const level = Math.max(0, avg - (threshold * 0.35));
        const idx = Math.min(glyphs.length - 1, Math.floor(level * 8));
        line += glyphs[idx];
      }
      next.push(line);
    }
    this.matrix24x8 = next;
  }

  protected override activateFallback(): void {
    if (!this.ctx) return;
    this.shortwaveGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.15);
  }

  public override getDiagnostics(): KHSDiagnostics {
    const moment = this.moments[this.currentMoment] ?? this.buildMoments()[0];
    const now = this.ctx?.currentTime ?? 0;
    const elapsed = Math.max(0, now - this.momentStart);
    const progress = Math.max(0, Math.min(100, Math.round((elapsed / Math.max(0.001, this.momentTransition)) * 100)));
    const densityGlyph = (['░', '▒', '▓', '█'][moment.density - 1] as '░' | '▒' | '▓' | '█');
    const widthTicks = Math.max(0, Math.min(5, Math.round(moment.width * 5)));
    const widthBar = `L${'▮'.repeat(widthTicks)}${'▯'.repeat(5 - widthTicks)}R`;
    return {
      ...this.contract,
      momentIndex: this.currentMoment + 1,
      momentTotal: this.moments.length || 12,
      spectralBias: moment.bias,
      densityGlyph,
      widthBar,
      transitionProgress: progress,
      nextBoundarySec: Math.max(0, Math.ceil(this.momentEnd - now)),
      matrix24x8: [...this.matrix24x8],
    };
  }
}

const createDefaultModeDiagnostics = (): ModeDiagnosticsMap => ({
  [Mode.DRONE]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    bars: new Array(7).fill(0),
    cutoff: 0,
    resonance: 0,
    stepType: 'IDLE',
    signalStrength: 0,
    traunsteinActive: false,
    traunsteinIntensity: 'PRESENT',
  },
  [Mode.ENVIRON]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    matrix: Array.from({ length: 12 }, () => '.'.repeat(12)),
    activeCells: 0,
    roomFlux: 0,
    pressure: 0,
  },
  [Mode.MEMORY]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    rms: 0,
    source: 'FALLBACK',
    grainRate: 0,
    feedback: 0,
    ghostUntil: 0,
    f0: 0,
    memorySec: 10,
    reverbMix: 0.28,
  },
  [Mode.GENERATIVE]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    rows: Array.from({ length: 18 }, () => '.'.repeat(14)),
    rule: 110,
    invert: false,
    bandAmps: new Array(7).fill(0),
  },
  [Mode.ORACLE]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    rms: 0,
    source: 'FALLBACK',
    hexagram: [0, 0, 0, 0, 0, 0],
    text: 'LISTEN_FOR_EVENT',
    matrix24x8: Array.from({ length: 8 }, () => '.'.repeat(24)),
    densityGlyph: '░',
    phaseStep: 0,
    concreteIntensity: 'PRESENT',
  },
  [Mode.KHS]: {
    outDb: -120,
    modeOut: 'SILENT',
    fallback: false,
    fallbackReason: null,
    momentIndex: 1,
    momentTotal: 12,
    spectralBias: 'LOW',
    densityGlyph: '░',
    widthBar: 'L▯▯▯▯▯R',
    transitionProgress: 0,
    nextBoundarySec: 0,
    matrix24x8: Array.from({ length: 8 }, () => '.'.repeat(24)),
  },
});

type ActiveModeRuntime = {
  mode: Mode;
  engine: ModeEngine<ModeAudioContract>;
  graph: ModeGraph;
  gain: GainNode;
  enteredAt: number;
};

export class AudioDirector {
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly softClip: WaveShaperNode;
  private readonly analyser: AnalyserNode;
  private readonly floorNoise: AudioBufferSourceNode;
  private readonly floorGain: GainNode;
  private runtime: ActiveModeRuntime | null = null;
  private snapshot: AudioDirectorSnapshot;
  private diagIv: number | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, ctx.currentTime);
    this.softClip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    const drive = 2.2;
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i * 2 / curve.length) - 1;
      curve[i] = ((1 + drive) * x) / (1 + (drive * Math.abs(x)));
    }
    this.softClip.curve = curve;
    this.softClip.oversample = '2x';
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;

    this.masterGain.connect(this.softClip);
    this.masterGain.connect(this.analyser);
    this.softClip.connect(ctx.destination);

    this.floorNoise = ctx.createBufferSource();
    this.floorNoise.buffer = createNoiseBuffer(ctx, 2, true);
    this.floorNoise.loop = true;
    this.floorGain = ctx.createGain();
    this.floorGain.gain.setValueAtTime(0.0008, ctx.currentTime);
    this.floorNoise.connect(this.floorGain);
    this.floorGain.connect(this.masterGain);
    this.floorNoise.start();

    this.snapshot = {
      activeMode: null,
      audioState: this.ctx.state,
      outDb: -120,
      modeOut: 'SILENT',
      fallback: false,
      fallbackReason: null,
      mode: createDefaultModeDiagnostics(),
    };

    this.diagIv = window.setInterval(() => this.updateDiagnostics(), 120);
  }

  private createEngine(mode: Mode): ModeEngine<ModeAudioContract> {
    switch (mode) {
      case Mode.DRONE: return new DroneEngine();
      case Mode.ENVIRON: return new EnvironEngine();
      case Mode.MEMORY: return new MemoryEngine();
      case Mode.GENERATIVE: return new GenerativeEngine();
      case Mode.ORACLE: return new OracleEngine();
      case Mode.KHS: return new KHSEngine();
      default: return new DroneEngine();
    }
  }

  public async switchMode(mode: Mode): Promise<void> {
    if (this.runtime?.mode === mode) return;
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch {}
    }
    const prev = this.runtime;
    const engine = this.createEngine(mode);
    const graph = engine.createGraph(this.ctx);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    graph.output.connect(gain);
    gain.connect(this.masterGain);
    await engine.start();

    const fadeIn = 0.2 + (Math.random() * 0.4);
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fadeIn);

    this.runtime = {
      mode,
      engine,
      graph,
      gain,
      enteredAt: this.ctx.currentTime,
    };

    this.snapshot.activeMode = mode;

    if (prev) {
      const fadeOut = 0.2 + (Math.random() * 0.4);
      const t = this.ctx.currentTime;
      prev.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
      prev.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
      window.setTimeout(() => {
        try { prev.engine.stop(); } catch {}
        try { prev.graph.dispose(); } catch {}
        try { prev.gain.disconnect(); } catch {}
      }, Math.round((fadeOut * 1000) + 80));
    }
  }

  public setModeParams(mode: Mode, params: Record<string, unknown>): void {
    if (!this.runtime || this.runtime.mode !== mode) return;
    this.runtime.engine.setParams(params);
  }

  private updateDiagnostics(): void {
    this.snapshot.audioState = this.ctx.state;
    const td = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i += 1) sum += td[i] * td[i];
    const rms = Math.sqrt(sum / td.length);
    const outDb = Number(rmsToDb(rms).toFixed(1));
    this.snapshot.outDb = outDb;

    if (!this.runtime) {
      this.snapshot.modeOut = outDb > SILENCE_DB ? 'ACTIVE' : 'SILENT';
      this.snapshot.fallback = false;
      this.snapshot.fallbackReason = null;
      return;
    }

    const elapsed = this.ctx.currentTime - this.runtime.enteredAt;
    if (elapsed >= CONTRACT_SECONDS && outDb <= SILENCE_DB && !this.runtime.engine.isFallbackActive()) {
      console.warn(`[DR5] ${this.runtime.mode} violated sound contract at 3s. Engaging fallback bed.`);
      this.runtime.engine.ensureFallback('AUTO_NOISE_BED');
    }

    const modeOut: ModeOutputState = this.runtime.engine.isFallbackActive()
      ? 'FALLBACK'
      : (outDb > SILENCE_DB ? 'ACTIVE' : 'SILENT');
    const fallbackReason = this.runtime.engine.getFallbackReason();
    const contract: ModeAudioContract = {
      outDb,
      modeOut,
      fallback: this.runtime.engine.isFallbackActive(),
      fallbackReason,
    };
    this.runtime.engine.setContract(contract);
    const modeDiag = this.runtime.engine.getDiagnostics();
    this.snapshot.mode[this.runtime.mode] = modeDiag as any;
    this.snapshot.modeOut = modeDiag.modeOut;
    this.snapshot.fallback = modeDiag.fallback;
    this.snapshot.fallbackReason = modeDiag.fallbackReason;
  }

  public getSnapshot(): AudioDirectorSnapshot {
    return {
      ...this.snapshot,
      mode: { ...this.snapshot.mode },
    };
  }

  public async resume(reason = 'manual'): Promise<void> {
    if (this.ctx.state === 'running') return;
    try {
      await this.ctx.resume();
    } catch {
      console.warn(`[DR5] resume failed: ${reason}`);
    }
  }

  public dispose(): void {
    if (this.diagIv) window.clearInterval(this.diagIv);
    if (this.runtime) {
      try { this.runtime.engine.stop(); } catch {}
      try { this.runtime.graph.dispose(); } catch {}
      try { this.runtime.gain.disconnect(); } catch {}
      this.runtime = null;
    }
    try { this.floorNoise.stop(); } catch {}
    try { this.floorNoise.disconnect(); } catch {}
    try { this.floorGain.disconnect(); } catch {}
    try { this.masterGain.disconnect(); } catch {}
    try { this.softClip.disconnect(); } catch {}
    try { this.analyser.disconnect(); } catch {}
  }
}
