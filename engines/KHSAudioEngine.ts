import { KHSState } from '../types/audio';

export class KHSAudioEngine {
  private audioContext: AudioContext;
  private mainGain: GainNode;
  private spectralShaper: BiquadFilterNode[] = [];
  private partials: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; baseFreq: number }[] = [];
  private radio = { element: null as HTMLAudioElement | null, gain: null as GainNode | null, filter: null as BiquadFilterNode | null, analyser: null as AnalyserNode | null };
  private moment = { id: 0, startAt: 0, nextAt: 0, fadeDur: 45, targetGains: [] as number[], driftFreqs: [] as number[], shapeFreqs: [] as number[], shapeQs: [] as number[] };
  private visTimer: number | null = null;
  private momentTimer: number | null = null;
  private diagTimer: number | null = null;
  private onDiag?: (s: KHSState) => void;
  private radioActive = true;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.mainGain = audioContext.createGain();
    this.mainGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    this.mainGain.connect(audioContext.destination);
    this.buildGraph();
  }

  onDiagnostics(cb: (s: KHSState) => void) { this.onDiag = cb; }

  private buildGraph() {
    const ctx = this.audioContext;
    const roomModes = [110, 240, 800, 1400, 2800];
    this.spectralShaper = roomModes.map(freq => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, ctx.currentTime); f.Q.setValueAtTime(10, ctx.currentTime); f.connect(this.mainGain); return f;
    });
    const RATIOS = [1, 1.0679, 1.125, 1.1892, 1.25, 1.3333, 1.4142, 1.4983, 1.618, 1.7818, 1.88, 2.0, 2.13, 2.25];
    this.partials = RATIOS.map((ratio) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); const pan = ctx.createStereoPanner();
      const base = 43.2 * ratio; osc.type = 'sine'; osc.frequency.setValueAtTime(base, ctx.currentTime); gain.gain.setValueAtTime(0.008, ctx.currentTime);
      osc.connect(gain); gain.connect(pan); this.spectralShaper.forEach(f => pan.connect(f)); osc.start(); return { osc, gain, pan, baseFreq: base };
    });
    // Radio chain
    const radioGain = ctx.createGain(); radioGain.gain.setValueAtTime(0.0, ctx.currentTime);
    const radioFilter = ctx.createBiquadFilter(); radioFilter.type = 'bandpass';
    const radioAnalyser = ctx.createAnalyser(); radioAnalyser.fftSize = 512;
    try {
      const el = new Audio('https://dradio-edge-209a-fra-lg-cdn.cast.addradio.de/dradio/dlf/live/mp3/128/stream.mp3');
      el.crossOrigin = 'anonymous'; el.loop = true; const src = ctx.createMediaElementSource(el);
      src.connect(radioAnalyser); radioAnalyser.connect(radioFilter); radioFilter.connect(radioGain); this.spectralShaper.forEach(f => radioGain.connect(f));
      this.radio = { element: el, gain: radioGain, filter: radioFilter, analyser: radioAnalyser };
    } catch { this.radio = { element: null, gain: radioGain, filter: radioFilter, analyser: radioAnalyser }; }
  }

  private scheduleNewMoment() {
    const ctx = this.audioContext; const now = ctx.currentTime;
    const nextIn = 60 + Math.random() * 120; const fade = 30 + Math.random() * 60;
    const target = new Array(14).fill(0);
    const peaks = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < peaks; k++) { const c = Math.floor(Math.random() * 14); const s = 0.8 + Math.random() * 2.5; for (let i = 0; i < 14; i++) { const d = (i - c) / s; target[i] += Math.exp(-0.5 * d * d); } }
    const max = Math.max(0.0001, ...target); for (let i = 0; i < 14; i++) target[i] /= max;
    const targetGains = target.map(v => 0.003 + v * 0.06);
    const driftFreqs = this.partials.map(p => p.baseFreq * (1 + (Math.random() * 0.06 - 0.03)));
    this.partials.forEach((p, i) => {
      p.gain.gain.cancelScheduledValues(now); p.gain.gain.setValueAtTime(p.gain.gain.value, now);
      p.gain.gain.linearRampToValueAtTime(targetGains[i], now + fade);
      const panTarget = -0.6 + Math.random() * 1.2; p.pan.pan.cancelScheduledValues(now); p.pan.pan.setValueAtTime(p.pan.pan.value, now);
      p.pan.pan.linearRampToValueAtTime(panTarget, now + fade);
      p.osc.frequency.cancelScheduledValues(now); p.osc.frequency.setValueAtTime(p.osc.frequency.value, now);
      p.osc.frequency.linearRampToValueAtTime(driftFreqs[i], now + fade);
    });
    if (this.radio.gain) {
      const gp = this.radio.gain.gain;
      gp.cancelScheduledValues(now);
      gp.setValueAtTime(gp.value, now);
      gp.linearRampToValueAtTime(this.radioActive ? 0.15 : 0.0, now + fade);
    }
    // spectral shaper gentle retune
    const shapeFreqs: number[] = []; const shapeQs: number[] = [];
    this.spectralShaper.forEach(filt => {
      const baseF = filt.frequency.value; const fTarget = Math.max(60, Math.min(12000, baseF * (0.9 + Math.random() * 0.2)));
      const qTarget = 8 + Math.random() * 6; filt.frequency.cancelScheduledValues(now); filt.frequency.setValueAtTime(baseF, now);
      filt.frequency.linearRampToValueAtTime(fTarget, now + fade); filt.Q.cancelScheduledValues(now); filt.Q.setValueAtTime(filt.Q.value, now);
      filt.Q.linearRampToValueAtTime(qTarget, now + fade); shapeFreqs.push(fTarget); shapeQs.push(qTarget);
    });
    this.moment = { id: this.moment.id + 1, startAt: now, nextAt: now + nextIn, fadeDur: fade, targetGains, driftFreqs, shapeFreqs, shapeQs };
  }

  start() {
    this.scheduleNewMoment();
    this.momentTimer = window.setInterval(() => { const t = this.audioContext.currentTime; if (t >= this.moment.nextAt) this.scheduleNewMoment(); }, 1000);
    this.diagTimer = window.setInterval(() => {
      const gains = this.moment.targetGains; const freqs = this.moment.driftFreqs; const sum = gains.reduce((a,b)=>a+b,0)||1;
      const centroid = gains.reduce((a,g,i)=>a+g*freqs[i],0)/sum; const active = gains.filter(g=>g>0.01).length;
      const nextShift = Math.max(0, Math.ceil(this.moment.nextAt - this.audioContext.currentTime));
      const fadePct = Math.max(0, Math.min(100, Math.round(((this.audioContext.currentTime - this.moment.startAt)/this.moment.fadeDur)*100)));
      const shapeF = this.moment.shapeFreqs.reduce((a,b)=>a+b,0)/this.moment.shapeFreqs.length;
      const shapeQ = this.moment.shapeQs.reduce((a,b)=>a+b,0)/this.moment.shapeQs.length;
      this.onDiag?.({ active, centroid, nextShift, momentId: this.moment.id, fadePct, shapeF, shapeQ, spectralDensity: [] });
    }, 1000);
  }

  setRadioActive(active: boolean) {
    this.radioActive = active; const g = this.radio.gain; if (!g) return; const t = this.audioContext.currentTime;
    const gp = g.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(active ? 0.15 : 0.0, t + 1);
    try { if (active) this.radio.element?.play(); else this.radio.element?.pause(); } catch {}
  }

  dispose() {
    if (this.momentTimer) window.clearInterval(this.momentTimer);
    if (this.diagTimer) window.clearInterval(this.diagTimer);
    this.partials.forEach(p => { try { p.osc.stop(); } catch {}; try { p.osc.disconnect(); p.gain.disconnect(); p.pan.disconnect(); } catch {} });
    try { this.mainGain.disconnect(); } catch {}
    try { this.radio.element?.pause(); } catch {}
  }
}
