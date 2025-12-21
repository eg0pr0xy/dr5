import { KHSState } from '../types/audio';

export class KHSAudioEngine {
  private audioContext: AudioContext;
  private mainGain: GainNode;
  private bus: GainNode;
  private lpf: BiquadFilterNode;
  private hpf: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private spectralShaper: BiquadFilterNode[] = [];
  private partials: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; baseFreq: number }[] = [];
  private radio = { element: null as HTMLAudioElement | null, gain: null as GainNode | null, filter: null as BiquadFilterNode | null, analyser: null as AnalyserNode | null };
  private moment = {
    id: 0,
    startAt: 0,
    nextAt: 0,
    fadeDur: 45,
    targetGains: [] as number[],
    driftFreqs: [] as number[],
    shapeFreqs: [] as number[],
    shapeQs: [] as number[],
    transformationType: 'rotation' as 'rotation' | 'inversion' | 'multiplication' | 'division',
    formType: 'punktuell' as 'punktuell' | 'gruppen' | 'statistisch'
  };
  private visTimer: number | null = null;
  private momentTimer: number | null = null;
  private diagTimer: number | null = null;
  private onDiag?: (s: KHSState) => void;
  private radioActive = true;
  private spectralPeaks: number[] = [];
  private stockhausenState = {
    rotationAngle: 0,
    statisticalDensity: 0.5,
    groupSize: 3,
    transformationMatrix: [] as number[][]
  };

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.mainGain = audioContext.createGain();
    this.mainGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    // Master bus: gentle HPF/LPF to keep ambient drone, remove harsh highs
    this.bus = audioContext.createGain();
    this.bus.gain.setValueAtTime(1.0, audioContext.currentTime);
    this.lpf = audioContext.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.setValueAtTime(550, audioContext.currentTime);
    this.lpf.Q.setValueAtTime(0.707, audioContext.currentTime);
    this.hpf = audioContext.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.setValueAtTime(35, audioContext.currentTime);
    this.comp = audioContext.createDynamicsCompressor();
    this.comp.threshold.setValueAtTime(-24, audioContext.currentTime);
    this.comp.knee.setValueAtTime(30, audioContext.currentTime);
    this.comp.ratio.setValueAtTime(6, audioContext.currentTime);
    this.comp.attack.setValueAtTime(0.3, audioContext.currentTime);
    this.comp.release.setValueAtTime(0.25, audioContext.currentTime);
    // chain: all voices -> bus -> lpf -> hpf -> comp -> mainGain -> destination
    this.bus.connect(this.lpf);
    this.lpf.connect(this.hpf);
    this.hpf.connect(this.comp);
    this.comp.connect(this.mainGain);
    this.mainGain.connect(audioContext.destination);
    // Don't build/start audio sources here - wait for start() method
  }

  onDiagnostics(cb: (s: KHSState) => void) { this.onDiag = cb; }

  private buildGraph() {
    const ctx = this.audioContext;
    const roomModes = [86, 172, 344, 516, 688];
    this.spectralShaper = roomModes.map(freq => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, ctx.currentTime);
      f.Q.setValueAtTime(1.5, ctx.currentTime);
      f.connect(this.bus);
      return f;
    });
    const RATIOS = [1, 1.0679, 1.125, 1.1892, 1.25, 1.3333, 1.4142, 1.4983, 1.618, 1.7818, 1.88, 2.0, 2.13, 2.25];
    this.partials = RATIOS.map((ratio) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); const pan = ctx.createStereoPanner();
      const base = 43.2 * ratio; osc.type = 'sine'; osc.frequency.setValueAtTime(base, ctx.currentTime); gain.gain.setValueAtTime(0.0025, ctx.currentTime);
      osc.connect(gain); gain.connect(pan); this.spectralShaper.forEach(f => pan.connect(f)); osc.start(); return { osc, gain, pan, baseFreq: base };
    });
    // Radio chain
    const radioGain = ctx.createGain(); radioGain.gain.setValueAtTime(0.0, ctx.currentTime);
    const radioFilter = ctx.createBiquadFilter(); radioFilter.type = 'lowpass'; radioFilter.frequency.setValueAtTime(800, ctx.currentTime); radioFilter.Q.setValueAtTime(0.707, ctx.currentTime);
    const radioAnalyser = ctx.createAnalyser(); radioAnalyser.fftSize = 512;
    try {
      const el = new Audio('https://dradio-edge-209a-fra-lg-cdn.cast.addradio.de/dradio/dlf/live/mp3/128/stream.mp3');
      el.crossOrigin = 'anonymous'; el.loop = true; const src = ctx.createMediaElementSource(el);
      src.connect(radioAnalyser);
      radioAnalyser.connect(radioFilter);
      radioFilter.connect(radioGain);
      radioGain.connect(this.bus);
      // Gracefully handle load/playback errors by ramping radio bed to 0
      el.addEventListener('error', () => {
        const t = ctx.currentTime; const gp = radioGain.gain;
        gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t); gp.linearRampToValueAtTime(0.0, t + 0.5);
      });
      this.radio = { element: el, gain: radioGain, filter: radioFilter, analyser: radioAnalyser };
    } catch { this.radio = { element: null, gain: radioGain, filter: radioFilter, analyser: radioAnalyser }; }
  }

  private scheduleNewMoment() {
    const ctx = this.audioContext; const now = ctx.currentTime;

    // Stockhausen-inspired moment structure
    const formTypes: ('punktuell' | 'gruppen' | 'statistisch')[] = ['punktuell', 'gruppen', 'statistisch'];
    const transformationTypes: ('rotation' | 'inversion' | 'multiplication' | 'division')[] = ['rotation', 'inversion', 'multiplication', 'division'];

    const formType = formTypes[Math.floor(Math.random() * formTypes.length)];
    const transformationType = transformationTypes[Math.floor(Math.random() * transformationTypes.length)];

    // Duration based on form type (punktuell = short, gruppen = medium, statistisch = long)
    let nextIn: number, fade: number;
    switch (formType) {
      case 'punktuell': nextIn = 30 + Math.random() * 60; fade = 5 + Math.random() * 10; break;
      case 'gruppen': nextIn = 60 + Math.random() * 90; fade = 15 + Math.random() * 20; break;
      case 'statistisch': nextIn = 90 + Math.random() * 120; fade = 25 + Math.random() * 40; break;
    }

    // Generate target gains based on form type
    const target = new Array(14).fill(0);
    let peaks: number;

    switch (formType) {
      case 'punktuell':
        // Single dominant peak
        peaks = 1;
        break;
      case 'gruppen':
        // 2-4 peaks forming a group
        peaks = 2 + Math.floor(Math.random() * 3);
        break;
      case 'statistisch':
        // Statistical distribution across spectrum
        peaks = 3 + Math.floor(Math.random() * 5);
        break;
    }

    // Apply transformation to spectral distribution
    for (let k = 0; k < peaks; k++) {
      let center = Math.floor(Math.random() * 14);

      // Apply transformation
      switch (transformationType) {
        case 'rotation':
          center = (center + 7) % 14; // Rotate by half spectrum
          break;
        case 'inversion':
          center = 13 - center; // Mirror spectrum
          break;
        case 'multiplication':
          center = Math.min(13, center * 2); // Double frequency position
          break;
        case 'division':
          center = Math.floor(center / 2); // Halve frequency position
          break;
      }

      const spread = formType === 'punktuell' ? 0.5 : formType === 'gruppen' ? 1.2 : 2.0;
      for (let i = 0; i < 14; i++) {
        const distance = Math.abs(i - center) / spread;
        target[i] += Math.exp(-0.5 * distance * distance);
      }
    }

    const max = Math.max(0.0001, ...target);
    for (let i = 0; i < 14; i++) target[i] /= max;

    const targetGains = target.map((v, i) => {
      const tilt = 1 / (1 + i * 0.25); // High frequency rolloff
      let gain = tilt * (0.003 + v * 0.05);

      // Form-specific gain adjustments
      switch (formType) {
        case 'punktuell':
          gain *= 1.5; // More intense single events
          break;
        case 'gruppen':
          gain *= 1.2; // Moderate intensity for groups
          break;
        case 'statistisch':
          gain *= 0.8; // Softer for statistical moments
          break;
      }

      return gain;
    });

    // Generate frequency drifts with transformation
    const driftFreqs = this.partials.map((p, i) => {
      let drift = 1 + (Math.random() * 0.04 - 0.02); // Base drift

      // Apply transformation to frequency relationships
      switch (transformationType) {
        case 'rotation':
          // Rotate frequency ratios
          drift *= Math.sin((i / 14) * Math.PI * 2 + this.stockhausenState.rotationAngle);
          break;
        case 'inversion':
          // Invert around fundamental
          drift = 2 - drift;
          break;
        case 'multiplication':
          // Multiply intervals
          drift *= (i % 7) + 1;
          break;
        case 'division':
          // Divide intervals
          drift /= (i % 7) + 1;
          break;
      }

      return p.baseFreq * Math.max(0.5, Math.min(2.0, drift));
    });

    // Apply moment structure to partials
    this.partials.forEach((p, i) => {
      p.gain.gain.cancelScheduledValues(now);
      p.gain.gain.setValueAtTime(p.gain.gain.value, now);
      p.gain.gain.linearRampToValueAtTime(targetGains[i], now + fade);

      // Form-specific panning
      let panTarget: number;
      switch (formType) {
        case 'punktuell':
          panTarget = Math.sin(i * 0.5) * 0.8; // Single focused position
          break;
        case 'gruppen':
          panTarget = Math.sin(i * 0.3) * 0.6; // Group clustering
          break;
        case 'statistisch':
          panTarget = -0.8 + Math.random() * 1.6; // Statistical distribution
          break;
      }

      p.pan.pan.cancelScheduledValues(now);
      p.pan.pan.setValueAtTime(p.pan.pan.value, now);
      p.pan.pan.linearRampToValueAtTime(panTarget, now + fade);

      p.osc.frequency.cancelScheduledValues(now);
      p.osc.frequency.setValueAtTime(p.osc.frequency.value, now);
      p.osc.frequency.linearRampToValueAtTime(driftFreqs[i], now + fade);
    });

    // Radio integration based on form type
    if (this.radio.gain) {
      const gp = this.radio.gain.gain;
      gp.cancelScheduledValues(now);
      gp.setValueAtTime(gp.value, now);

      let radioLevel: number;
      switch (formType) {
        case 'punktuell':
          radioLevel = this.radioActive ? 0.05 : 0.0; // Minimal in single events
          break;
        case 'gruppen':
          radioLevel = this.radioActive ? 0.08 : 0.0; // Moderate in groups
          break;
        case 'statistisch':
          radioLevel = this.radioActive ? 0.15 : 0.0; // Prominent in statistical moments
          break;
      }

      gp.linearRampToValueAtTime(radioLevel, now + fade);
    }

    // Spectral shaping with transformation influence
    const shapeFreqs: number[] = [];
    const shapeQs: number[] = [];

    this.spectralShaper.forEach((filt, idx) => {
      const baseF = filt.frequency.value;
      let fTarget = Math.max(60, Math.min(12000, baseF * (0.9 + Math.random() * 0.2)));

      // Apply transformation to filter frequencies
      switch (transformationType) {
        case 'rotation':
          fTarget *= Math.sin((idx / 5) * Math.PI * 2 + this.stockhausenState.rotationAngle) * 0.3 + 1;
          break;
        case 'inversion':
          fTarget = 20000 - fTarget; // Mirror around high frequency
          break;
        case 'multiplication':
          fTarget *= (idx + 1) * 0.5 + 1;
          break;
        case 'division':
          fTarget /= (idx + 1) * 0.5 + 1;
          break;
      }

      const qTarget = 8 + Math.random() * 6;

      filt.frequency.cancelScheduledValues(now);
      filt.frequency.setValueAtTime(baseF, now);
      filt.frequency.linearRampToValueAtTime(fTarget, now + fade);

      filt.Q.cancelScheduledValues(now);
      filt.Q.setValueAtTime(filt.Q.value, now);
      filt.Q.linearRampToValueAtTime(qTarget, now + fade);

      shapeFreqs.push(fTarget);
      shapeQs.push(qTarget);
    });

    // Update transformation state
    this.stockhausenState.rotationAngle += 0.1;
    if (this.stockhausenState.rotationAngle > Math.PI * 2) {
      this.stockhausenState.rotationAngle = 0;
    }

    this.moment = {
      id: this.moment.id + 1,
      startAt: now,
      nextAt: now + nextIn,
      fadeDur: fade,
      targetGains,
      driftFreqs,
      shapeFreqs,
      shapeQs,
      transformationType,
      formType
    };
  }

  start() {
    // Build and start audio sources now that AudioContext should be running
    this.buildGraph();
    this.scheduleNewMoment();
    this.momentTimer = window.setInterval(() => { const t = this.audioContext.currentTime; if (t >= this.moment.nextAt) this.scheduleNewMoment(); }, 1000);
    this.diagTimer = window.setInterval(() => {
      const gains = this.moment.targetGains; const freqs = this.moment.driftFreqs; const sum = gains.reduce((a,b)=>a+b,0)||1;
      const centroid = gains.reduce((a,g,i)=>a+g*freqs[i],0)/sum; const active = gains.filter(g=>g>0.01).length;
      const nextShift = Math.max(0, Math.ceil(this.moment.nextAt - this.audioContext.currentTime));
      const fadePct = Math.max(0, Math.min(100, Math.round(((this.audioContext.currentTime - this.moment.startAt)/this.moment.fadeDur)*100)));
      const shapeF = this.moment.shapeFreqs.reduce((a,b)=>a+b,0)/this.moment.shapeFreqs.length;
      const shapeQ = this.moment.shapeQs.reduce((a,b)=>a+b,0)/this.moment.shapeQs.length;
      this.onDiag?.({
        active,
        centroid,
        nextShift,
        momentId: this.moment.id,
        fadePct,
        shapeF,
        shapeQ,
        spectralDensity: this.spectralPeaks,
        formType: this.moment.formType,
        transformationType: this.moment.transformationType
      });
    }, 1000);
  }

  private detectSpectralPeaks(): number[] {
    if (!this.radio.analyser) return [];
    const buffer = new Uint8Array(this.radio.analyser.frequencyBinCount);
    this.radio.analyser.getByteFrequencyData(buffer);

    const peaks: number[] = [];
    const threshold = 200; // Minimum amplitude for peak detection
    const minDistance = 10; // Minimum bins between peaks

    for (let i = 1; i < buffer.length - 1; i++) {
      if (buffer[i] > threshold && buffer[i] > buffer[i-1] && buffer[i] > buffer[i+1]) {
        // Check if this peak is far enough from previous peaks
        const tooClose = peaks.some(prevBin => Math.abs(i - prevBin) < minDistance);
        if (!tooClose) {
          const frequency = (i / buffer.length) * (this.audioContext.sampleRate / 2);
          peaks.push(frequency);
        }
      }
    }

    this.spectralPeaks = peaks.slice(0, 5); // Keep top 5 peaks
    return this.spectralPeaks;
  }

  lockHarmonic(index: number): void {
    if (index < 0 || index >= this.spectralPeaks.length) return;
    const peakFreq = this.spectralPeaks[index];

    // Find closest partial and adjust it
    let closestIdx = 0;
    let minDiff = Infinity;
    this.partials.forEach((p, i) => {
      const diff = Math.abs(p.baseFreq - peakFreq);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    // Adjust the closest partial to lock to the peak
    const now = this.audioContext.currentTime;
    this.partials[closestIdx].osc.frequency.cancelScheduledValues(now);
    this.partials[closestIdx].osc.frequency.setValueAtTime(this.partials[closestIdx].osc.frequency.value, now);
    this.partials[closestIdx].osc.frequency.linearRampToValueAtTime(peakFreq, now + 2);

    // Boost the gain slightly
    this.partials[closestIdx].gain.gain.cancelScheduledValues(now);
    this.partials[closestIdx].gain.gain.setValueAtTime(this.partials[closestIdx].gain.gain.value, now);
    this.partials[closestIdx].gain.gain.linearRampToValueAtTime(0.008, now + 1);
  }

  setRadioActive(active: boolean) {
    this.radioActive = active; const g = this.radio.gain; if (!g) return; const t = this.audioContext.currentTime;
    const gp = g.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    // Extended fade time for smoother error recovery (5-10 seconds)
    const fadeTime = active ? 1.0 : 5.0;
    gp.linearRampToValueAtTime(active ? 0.1 : 0.0, t + fadeTime);
    try {
      if (active) {
        const p: any = this.radio.element?.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Playback failed (unsupported source or blocked). Ramp down smoothly.
            this.radioActive = false;
            const tt = this.audioContext.currentTime; const param = g.gain;
            param.cancelScheduledValues(tt); param.setValueAtTime(param.value, tt); param.linearRampToValueAtTime(0.0, tt + 8.0);
          });
        }
      } else {
        this.radio.element?.pause();
      }
    } catch {}
  }

  dispose() {
    if (this.momentTimer) window.clearInterval(this.momentTimer);
    if (this.diagTimer) window.clearInterval(this.diagTimer);
    this.partials.forEach(p => { try { p.osc.stop(); } catch {}; try { p.osc.disconnect(); p.gain.disconnect(); p.pan.disconnect(); } catch {} });
    try { this.mainGain.disconnect(); } catch {}
    try { this.radio.element?.pause(); } catch {}
  }
}
