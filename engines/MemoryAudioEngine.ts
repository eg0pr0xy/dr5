import { MemoryEngineConfig, MemoryDiagnostics, GrainScheduler, AudioEngineNodes } from '../types/audio';

export class MemoryAudioEngine {
  private audioContext: AudioContext;
  private config: MemoryEngineConfig;
  private nodes: AudioEngineNodes;
  private ambientRms: number = 0;
  private currentStep: number = 0;
  private currentF0: number = 110;
  private lastGhostAt: string = '--:--:--';
  
  // Event callbacks
  private onDiagnosticsUpdate?: (diagnostics: MemoryDiagnostics) => void;
  private onError?: (error: string) => void;
  
  // Constants
  private readonly FREQ_STEPS = [400, 800, 1200, 300, 2000, 600, 1600, 100];
  private readonly Q_STEPS = [2, 12, 5, 25, 4, 40, 8, 1];
  private readonly CAGE_FRAGMENTS = ["4'33\"", "SILENCE", "EVENT", "CHANCE", "ROOM", "EMPTY", "I_CHING", "MUSHROOM", "DECAY", "LISTEN"];
  
  // Cleanup tracking
  private intervalId: number | null = null;
  private diagIvId: number | null = null;
  private ghostId: number | null = null;
  private stepTimeoutId: number | null = null;
  
  constructor(audioContext: AudioContext, config: MemoryEngineConfig = {}) {
    this.audioContext = audioContext;
    this.config = {
      bufferSize: Math.floor(audioContext.sampleRate * 4),
      grainDuration: 0.30,
      density: 0.5,
      ghostsActive: true,
      pipsActive: true,
      droneActive: true,
      ...config
    };

    this.nodes = this.initializeAudioNodes();
    // Don't start audio sources here - wait for start() method to ensure AudioContext is ready
  }
  
  private initializeAudioNodes(): AudioEngineNodes {
    const bufferSize = this.config.bufferSize!;
    const ringBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const ringData = ringBuffer.getChannelData(0);
    ringData.fill(0);
    
    const mainGain = this.audioContext.createGain();
    mainGain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    mainGain.connect(this.audioContext.destination);
    
    const droneFilter = this.audioContext.createBiquadFilter();
    droneFilter.type = 'bandpass';
    
    const droneGain = this.audioContext.createGain();
    const staticGain = this.audioContext.createGain();
    const dustGain = this.audioContext.createGain();
    const grainsGain = this.audioContext.createGain();
    grainsGain.gain.setValueAtTime(0.35, this.audioContext.currentTime);
    
    // Create noise sources
    const noiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 2, this.audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    
    const dustBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 4, this.audioContext.sampleRate);
    const dustData = dustBuffer.getChannelData(0);
    for (let i = 0; i < dustData.length; i++) if (Math.random() > 0.9997) dustData[i] = (Math.random()*2-1)*0.4;
    
    // Spectral tilt filters
    const tiltLow = this.audioContext.createBiquadFilter();
    tiltLow.type = 'lowshelf';
    tiltLow.frequency.setValueAtTime(500, this.audioContext.currentTime);
    tiltLow.gain.setValueAtTime(4, this.audioContext.currentTime);
    
    const tiltHigh = this.audioContext.createBiquadFilter();
    tiltHigh.type = 'highshelf';
    tiltHigh.frequency.setValueAtTime(4000, this.audioContext.currentTime);
    tiltHigh.gain.setValueAtTime(-12, this.audioContext.currentTime);
    
    // Connect grain chain with harmonic resonators (wet/dry)
    grainsGain.connect(tiltLow);
    tiltLow.connect(tiltHigh);
    const grainsLpf = this.audioContext.createBiquadFilter();
    grainsLpf.type = 'lowpass';
    grainsLpf.frequency.setValueAtTime(900, this.audioContext.currentTime);
    grainsLpf.Q.setValueAtTime(0.707, this.audioContext.currentTime);
    tiltHigh.connect(grainsLpf);
    const resWet = this.audioContext.createGain(); resWet.gain.setValueAtTime(0.7, this.audioContext.currentTime);
    const resDry = this.audioContext.createGain(); resDry.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    grainsLpf.connect(resDry); resDry.connect(mainGain);
    const baseF0 = 110; const harmonics = [1,2,3,4,5,6];
    const resonators = harmonics.map(h => {
      const f = this.audioContext.createBiquadFilter(); f.type = 'bandpass';
      f.Q.setValueAtTime(28, this.audioContext.currentTime);
      f.frequency.setValueAtTime(baseF0 * h, this.audioContext.currentTime);
      grainsLpf.connect(f); f.connect(resWet); return f;
    });
    resWet.connect(mainGain);
    
    // Window curve for grains
    const windowSamples = Math.max(128, Math.floor(this.audioContext.sampleRate * this.config.grainDuration!));
    const windowCurve = new Float32Array(windowSamples);
    for (let i = 0; i < windowSamples; i++) {
      windowCurve[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSamples - 1)));
    }
    
    // Scheduler
    const scheduler: GrainScheduler = {
      timer: null,
      lookahead: 0.08,
      intervalMs: 25,
      nextTime: this.audioContext.currentTime + 0.05,
      grainDur: this.config.grainDuration!,
      targetRate: 10,
      ghostUntil: 0,
      userDensity: this.config.density!
    };
    
    return {
      micStream: null,
      processor: null,
      workletNode: null,
      internalWriter: null,
      ringBuffer,
      ringData,
      bufferPtr: 0,
      capturedSamples: 0,
      mainGain,
      droneFilter,
      droneGain,
      staticGain,
      dustGain,
      grainsGain,
      windowCurve,
      tiltLow,
      tiltHigh,
      scheduler,
      grainsLpf,
      resonators,
      resWet,
      resDry
    };
  }
  
  private startAudioSources(): void {
    // Create evolving spectral textures instead of static noise
    this.createPreparedSoundscapes();

    // Create harmonic resonators for "prepared" sound sources
    this.createHarmonicResonators();

    // Create evolving ambient drone
    this.createAmbientDrone();
  }

  private createPreparedSoundscapes(): void {
    // Create multiple prepared sound sources with different characteristics
    const soundscapes = [
      { type: 'tuned_objects', baseFreq: 220, harmonics: [1, 2.1, 3.2, 4.3] },
      { type: 'bowed_strings', baseFreq: 146, harmonics: [1, 2.3, 3.7, 5.1] },
      { type: 'tuned_wind', baseFreq: 330, harmonics: [1, 1.5, 2.25, 3.375] },
      { type: 'vocal_resonance', baseFreq: 196, harmonics: [1, 2.7, 4.9, 7.3] }
    ];

    soundscapes.forEach((scape, index) => {
      const bufferSize = this.audioContext.sampleRate * 3; // 3 seconds
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate evolving harmonic textures
      let phase = 0;
      let modulationPhase = 0;

      for (let i = 0; i < bufferSize; i++) {
        const time = i / this.audioContext.sampleRate;
        let sample = 0;

        // Add harmonics with evolving amplitudes
        scape.harmonics.forEach((harmonic, hIndex) => {
          const freq = scape.baseFreq * harmonic;
          const amp = 0.3 / (hIndex + 1); // Fundamental loudest

          // Add slow amplitude modulation
          const modFreq = 0.1 + (hIndex * 0.05);
          const modulation = 0.5 + 0.3 * Math.sin(2 * Math.PI * modFreq * time);

          sample += amp * modulation * Math.sin(2 * Math.PI * freq * time + phase);
        });

        // Add subtle noise for texture
        sample += (Math.random() * 2 - 1) * 0.02;

        // Apply gentle envelope
        const envelope = Math.min(time * 0.5, 1) * Math.min((bufferSize - i) / (bufferSize * 0.3), 1);
        sample *= envelope;

        data[i] = Math.max(-1, Math.min(1, sample * 0.1)); // Prevent clipping

        phase += 0.001; // Very slow phase evolution
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.05 + (index * 0.02), this.audioContext.currentTime);

      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(scape.baseFreq, this.audioContext.currentTime);
      filter.Q.setValueAtTime(8, this.audioContext.currentTime);

      source.connect(gain);
      gain.connect(filter);
      filter.connect(this.nodes.mainGain);

      source.start();
    });
  }

  private createHarmonicResonators(): void {
    // Create "prepared" resonant objects that respond to mic input
    const resonators = [220, 330, 440, 550, 660, 880]; // Harmonic series

    resonators.forEach((freq, index) => {
      const resonator = this.audioContext.createBiquadFilter();
      resonator.type = 'bandpass';
      resonator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
      resonator.Q.setValueAtTime(15 + (index * 2), this.audioContext.currentTime);

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.8, this.audioContext.currentTime);

      // Connect to grains output for resonance
      this.nodes.grainsGain.connect(resonator);
      resonator.connect(gain);
      gain.connect(this.nodes.mainGain);
    });
  }

  private createAmbientDrone(): void {
    // Create slowly evolving ambient drone
    const droneFreqs = [55, 82.5, 110, 165]; // Subharmonic series

    droneFreqs.forEach((freq, index) => {
      const osc = this.audioContext.createOscillator();
      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

      const gain = this.audioContext.createGain();
      // Significantly increased volume for mobile audibility
      gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);

      // Add slow LFO modulation
      const lfo = this.audioContext.createOscillator();
      lfo.frequency.setValueAtTime(0.02 + (index * 0.01), this.audioContext.currentTime);

      const lfoGain = this.audioContext.createGain();
      lfoGain.gain.setValueAtTime(freq * 0.1, this.audioContext.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(gain);
      gain.connect(this.nodes.mainGain);

      osc.start();
      lfo.start();
    });
  }
  
  async start(): Promise<void> {
    try {
      // Start audio sources now that AudioContext should be running
      this.startAudioSources();

      await this.startMicrophone();
      this.startGrainScheduler();
      this.startResonatorCycle();
      this.startGhostScheduler();
      this.startDiagnosticsUpdater();
      this.startParameterSequencer();
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }
  
  private async startMicrophone(): Promise<void> {
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.nodes.micStream = micStream;
      const source = this.audioContext.createMediaStreamSource(micStream);

      // Prefer AudioWorklet for low-latency capture
      const base = (import.meta as any).env?.BASE_URL || '/';
      try {
        await this.audioContext.audioWorklet.addModule(`${base}worklets/memory-capture-processor.js`);
        const worklet = new (window as any).AudioWorkletNode(this.audioContext, 'memory-capture-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          outputChannelCount: [0],
          channelCount: 1,
        });
        worklet.port.onmessage = (e: MessageEvent) => {
          const msg: any = e.data;
          if (!msg || msg.t !== 'chunk') return;
          const input: Float32Array = msg.data;
          const bufferSize = this.config.bufferSize!;
          for (let i = 0; i < input.length; i++) {
            this.nodes.ringData[this.nodes.bufferPtr] = input[i];
            this.nodes.bufferPtr = (this.nodes.bufferPtr + 1) % bufferSize;
            if (this.nodes.capturedSamples < bufferSize) this.nodes.capturedSamples++;
          }
          if (typeof msg.rms === 'number') this.ambientRms = msg.rms;
        };
        source.connect(worklet);
        // Remove mic from speakers - analysis only
        // const nullGain = this.audioContext.createGain();
        // nullGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        // worklet.connect(nullGain);
        // nullGain.connect(this.audioContext.destination);
        this.nodes.workletNode = worklet;
        this.nodes.processor = null;
        return;
      } catch {}

      // Fallback: ScriptProcessor (legacy)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const bufferSize = this.config.bufferSize!;
        for (let i = 0; i < input.length; i++) {
          this.nodes.ringData[this.nodes.bufferPtr] = input[i];
          this.nodes.bufferPtr = (this.nodes.bufferPtr + 1) % bufferSize;
          if (this.nodes.capturedSamples < bufferSize) this.nodes.capturedSamples++;
        }
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        this.ambientRms = Math.sqrt(sum / input.length);
      };
      source.connect(processor);
      // Remove mic from speakers - analysis only
      // const nullGain = this.audioContext.createGain();
      // nullGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      // processor.connect(nullGain);
      // nullGain.connect(this.audioContext.destination);
      this.nodes.processor = processor;
    } catch (err) {
      this.startInternalMemoryFallback();
      this.onError?.('MIC_UNAVAILABLE_FALLBACK_NOISE');
    }
  }

  private startInternalMemoryFallback(): void {
    if (this.nodes.internalWriter) return;
    const bufferSize = this.config.bufferSize!;
    let lastOut = 0;
    this.nodes.internalWriter = window.setInterval(() => {
      for (let i = 0; i < 2048; i++) {
        const white = Math.random() * 2 - 1;
        const val = (lastOut + 0.01 * white) / 1.01;
        lastOut = val;
        this.nodes.ringData[this.nodes.bufferPtr] = val * 0.6;
        this.nodes.bufferPtr = (this.nodes.bufferPtr + 1) % bufferSize;
        if (this.nodes.capturedSamples < bufferSize) this.nodes.capturedSamples++;
      }
      this.ambientRms = 0.08;
    }, 120) as unknown as number;
  }

  private startGrainScheduler(): void {
    const scheduleGrain = (when: number) => {
      const ctx = this.audioContext;
      const { ringBuffer, grainsGain, windowCurve } = this.nodes;
      const sr = ctx.sampleRate;
      const dur = this.nodes.scheduler.grainDur;
      const bufLenSec = ringBuffer.length / sr;
      const filledSec = Math.min(this.nodes.capturedSamples, ringBuffer.length) / sr;
      if (filledSec < 0.25) return; // wait until buffer has some content
      
      const biasRecent = 0.35;
      const isGhost = when < this.nodes.scheduler.ghostUntil;
      const bias = isGhost ? 0.7 : biasRecent;
      
      const recentSpan = Math.max(0.1, Math.min(filledSec, 1.2));
      const randBack = Math.random() * recentSpan;
      const startBack = bias * randBack + (1 - bias) * (Math.random() * (filledSec || 0.1));
      
      let startSec = (this.nodes.bufferPtr / sr) - startBack;
      while (startSec < 0) startSec += bufLenSec;
      while (startSec >= bufLenSec) startSec -= bufLenSec;
      
      const src = ctx.createBufferSource();
      src.buffer = ringBuffer;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.setValueCurveAtTime(windowCurve, when, dur);
      src.connect(env);
      env.connect(grainsGain);
      
      try {
        src.start(when, startSec, Math.min(dur, bufLenSec - 0.001));
        src.stop(when + dur + 0.01);
      } catch {}
    };
    
    const tick = () => {
      const ctx = this.audioContext;
      const sched = this.nodes.scheduler;

      const baseRate = 3 + Math.min(0.5, Math.max(0, this.ambientRms)) * 20;
      const userTarget = 3 + (sched.userDensity * 16);
      const blended = baseRate * 0.6 + userTarget * 0.4;
      sched.targetRate = Math.min(32, blended + (ctx.currentTime < sched.ghostUntil ? 8 : 0));
      
      const period = 1 / Math.max(1, sched.targetRate);
      while (sched.nextTime < ctx.currentTime + sched.lookahead) {
        scheduleGrain(sched.nextTime);
        sched.nextTime += period;
      }
    };
    
    this.intervalId = window.setInterval(tick, this.nodes.scheduler.intervalMs);
  }

  private startResonatorCycle(): void {
    if (!this.nodes.resonators) return;
    let idx = 0;
    const fundamentals = [98, 110, 123, 131, 147, 165];
    const cycle = () => {
      const f0 = fundamentals[idx % fundamentals.length];
      this.currentF0 = f0;
      const now = this.audioContext.currentTime;
      this.nodes.resonators!.forEach((bp, i) => {
        const target = f0 * (i + 1);
        bp.frequency.setTargetAtTime(target, now, 0.5);
      });
      idx++;
      this.stepTimeoutId = window.setTimeout(cycle, 4000) as unknown as number;
    };
    cycle();
  }
  
  private startGhostScheduler(): void {
    if (!this.config.ghostsActive) return;
    
    const formatTimeHMS = (t: number) => {
      const d = new Date(t);
      const p = (n: number) => n.toString().padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    
    const scheduleGhost = () => {
      const now = this.audioContext.currentTime;
      const dur = 1.5 + Math.random() * 2.0;
      this.nodes.scheduler.ghostUntil = now + dur;
      this.lastGhostAt = formatTimeHMS(Date.now());

      this.onDiagnosticsUpdate?.({
        ...this.getDiagnostics(),
        lastGhost: this.lastGhostAt
      });

      // Schedule next ghost: 5-15 minutes (300000-900000ms)
      this.ghostId = window.setTimeout(scheduleGhost, 300000 + Math.random() * 600000) as unknown as number;
    };

    // Initial ghost: 5-10 minutes
    this.ghostId = window.setTimeout(scheduleGhost, 300000 + Math.random() * 300000) as unknown as number;
  }
  
  private startDiagnosticsUpdater(): void {
    this.diagIvId = window.setInterval(() => {
      const bufferSize = this.config.bufferSize!;
      const fill = Math.min(1, this.nodes.capturedSamples / bufferSize);
      const bufFill = Math.round(fill * 100);
      const grainRate = Math.round(this.nodes.scheduler.targetRate);
      const rms = Number(this.ambientRms.toFixed(3));
      
      const diagnostics: MemoryDiagnostics = {
        bufFill,
        grainRate,
        rms,
        lastGhost: this.lastGhostAt,
        currentStep: this.currentStep,
        cutoff: this.FREQ_STEPS[this.currentStep],
        q: this.Q_STEPS[this.currentStep],
        f0: this.currentF0
      };
      
      this.onDiagnosticsUpdate?.(diagnostics);
    }, 500);
  }
  
  private startParameterSequencer(): void {
    let lastStepTime = 0;

    const scheduleNextEvent = () => {
      const time = this.audioContext.currentTime;
      if (time - lastStepTime > 60) { // Changed from 6 to 60 seconds
        lastStepTime = time;
        this.currentStep = (this.currentStep + 1) % this.FREQ_STEPS.length;

        this.nodes.droneFilter.frequency.setTargetAtTime(
          this.FREQ_STEPS[this.currentStep],
          time,
          1.0 // Slower ramp
        );
        this.nodes.droneFilter.Q.setTargetAtTime(
          this.Q_STEPS[this.currentStep],
          time,
          1.0 // Slower ramp
        );
      }

      // Schedule next: 60-300 seconds (60000-300000ms)
      this.stepTimeoutId = window.setTimeout(scheduleNextEvent, 60000 + Math.random() * 240000) as unknown as number;
    };

    scheduleNextEvent();
  }
  
  updateParameters(params: Partial<MemoryEngineConfig>): void {
    if (params.density !== undefined) {
      this.nodes.scheduler.userDensity = params.density;
      this.config.density = params.density;
    }
    
    if (params.grainDuration !== undefined) {
      this.nodes.scheduler.grainDur = params.grainDuration;
      this.config.grainDuration = params.grainDuration;
      // Loudness normalization vs width (~sqrt reference at 160ms)
      const dur = Math.max(0.06, Math.min(0.32, params.grainDuration));
      const norm = Math.sqrt(0.16 / dur);
      const comp = Math.max(0.6, Math.min(1.6, norm));
      const base = 0.28;
      this.nodes.grainsGain.gain.setTargetAtTime(base * comp, this.audioContext.currentTime, 0.05);
    }
  }
  
  updateSpectralTilt(tilt: number): void {
    const gain = tilt * 9; // +/-9 dB
    this.nodes.tiltLow.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.08);
    this.nodes.tiltHigh.gain.setTargetAtTime(-gain, this.audioContext.currentTime, 0.08);
  }
  
  setGhostState(active: boolean): void {
    this.config.ghostsActive = active;
    if (!active && this.ghostId) {
      clearTimeout(this.ghostId);
      this.ghostId = null;
    } else if (active && !this.ghostId) {
      this.startGhostScheduler();
    }
  }
  
  setDroneState(active: boolean): void {
    this.config.droneActive = active;
    this.nodes.droneGain.gain.setValueAtTime(active ? 0.3 : 0, this.audioContext.currentTime);
  }
  
  getDiagnostics(): MemoryDiagnostics {
    const bufferSize = this.config.bufferSize!;
    const fill = Math.min(1, this.nodes.capturedSamples / bufferSize);
    
    return {
      bufFill: Math.round(fill * 100),
      grainRate: Math.round(this.nodes.scheduler.targetRate),
      rms: Number(this.ambientRms.toFixed(3)),
      lastGhost: this.lastGhostAt,
      currentStep: this.currentStep,
      cutoff: this.FREQ_STEPS[this.currentStep],
      q: this.Q_STEPS[this.currentStep],
      f0: this.currentF0
    };
  }
  
  setDiagnosticsCallback(callback: (diagnostics: MemoryDiagnostics) => void): void {
    this.onDiagnosticsUpdate = callback;
  }
  
  setErrorCallback(callback: (error: string) => void): void {
    this.onError = callback;
  }
  
  dispose(): void {
    // Clear all intervals and timeouts
    if (this.intervalId) window.clearInterval(this.intervalId);
    if (this.diagIvId) window.clearInterval(this.diagIvId);
    if (this.ghostId) window.clearTimeout(this.ghostId);
    if (this.stepTimeoutId) window.clearTimeout(this.stepTimeoutId);
    if (this.nodes.internalWriter) window.clearInterval(this.nodes.internalWriter);
    
    // Stop microphone
    if (this.nodes.micStream) {
      this.nodes.micStream.getTracks().forEach(t => t.stop());
    }
    
    // Disconnect capture nodes
    try { this.nodes.processor?.disconnect(); } catch {}
    try { this.nodes.workletNode?.disconnect(); } catch {}
    
    // Disconnect main gain
    this.nodes.mainGain.disconnect();
  }
}
