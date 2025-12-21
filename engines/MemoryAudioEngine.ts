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
    // CAGE-INSPIRED PREPARED ROOM: Rolling buffers with windowed access and spectral shaping
    // Avoids "thin" or repetitive sound through continuous spectral evolution

    // Primary rolling buffer system for indeterminate sound generation
    this.createRollingBufferSystem();

    // Spectral shaping system that responds to buffer content
    this.createSpectralShapingNetwork();

    // Rare, blended ghost events using rolling buffer content
    this.initializeGhostSystem();
  }

  private createRollingBufferSystem(): void {
    // PRIMARY SYSTEM: Rolling buffer with windowed spectral access
    // Continuously captures and processes audio through spectral windows

    // Create multiple overlapping spectral windows
    const spectralWindows = [
      { center: 200, width: 100, name: 'low_resonance' },
      { center: 500, width: 200, name: 'mid_presence' },
      { center: 1200, width: 400, name: 'high_air' },
      { center: 2800, width: 800, name: 'upper_harmonics' }
    ];

    spectralWindows.forEach((window, index) => {
      // Create bandpass filter for each spectral window
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(window.center, this.audioContext.currentTime);
      filter.Q.setValueAtTime(window.center / window.width, this.audioContext.currentTime);

      // Create gain control for each window
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.05 + Math.random() * 0.1, this.audioContext.currentTime);

      // Connect through spectral tilt system
      this.nodes.grainsGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.nodes.mainGain);

      // Add slow evolution to prevent static sound
      this.scheduleSpectralWindowEvolution(filter, gain, window, index);
    });
  }

  private scheduleSpectralWindowEvolution(filter: BiquadFilterNode, gain: GainNode, window: any, index: number): void {
    // SLOW SPECTRAL EVOLUTION: Changes over minutes, not seconds
    const evolutionInterval = 30000 + Math.random() * 60000; // 30-90 seconds

    const evolve = () => {
      const now = this.audioContext.currentTime;

      // Subtle center frequency drift
      const newCenter = window.center * (0.8 + Math.random() * 0.4);
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      filter.frequency.linearRampToValueAtTime(newCenter, now + 60); // 1 minute transition

      // Dynamic Q adjustment for spectral shaping
      const newQ = 2 + Math.random() * 8;
      filter.Q.cancelScheduledValues(now);
      filter.Q.setValueAtTime(filter.Q.value, now);
      filter.Q.linearRampToValueAtTime(newQ, now + 45); // 45 second transition

      // Amplitude modulation based on buffer activity
      const newGain = 0.02 + Math.random() * 0.08;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(newGain, now + 30); // 30 second transition
    };

    // Schedule first evolution
    setTimeout(evolve, evolutionInterval);

    // Schedule ongoing evolution
    setInterval(evolve, 120000 + Math.random() * 60000); // Every 2-3 minutes
  }

  private createSpectralShapingNetwork(): void {
    // SECONDARY SYSTEM: Spectral shaping network that processes rolling buffer content
    // Creates rich, non-repetitive textures through dynamic filtering

    // Create a series of dynamic filters that respond to buffer spectral content
    const shapingFilters = [
      { type: 'lowshelf', freq: 300, gain: -6 },
      { type: 'peaking', freq: 800, gain: 3 },
      { type: 'highshelf', freq: 3000, gain: -9 },
      { type: 'notch', freq: 150, gain: -20 }
    ];

    shapingFilters.forEach((config, index) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = config.type as BiquadFilterType;
      filter.frequency.setValueAtTime(config.freq, this.audioContext.currentTime);
      filter.gain.setValueAtTime(config.gain, this.audioContext.currentTime);
      filter.Q.setValueAtTime(1.0, this.audioContext.currentTime);

      // Connect to grains output for continuous spectral shaping
      this.nodes.grainsGain.connect(filter);
      filter.connect(this.nodes.mainGain);

      // Schedule dynamic evolution
      this.scheduleShapingFilterEvolution(filter, config, index);
    });
  }

  private scheduleShapingFilterEvolution(filter: BiquadFilterNode, config: any, index: number): void {
    // CONTINUOUS SPECTRAL EVOLUTION: Prevents static, repetitive sound
    const evolution = () => {
      const now = this.audioContext.currentTime;

      // Frequency drift based on buffer content
      const freqVariation = (Math.random() - 0.5) * config.freq * 0.3;
      const newFreq = Math.max(50, config.freq + freqVariation);

      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      filter.frequency.linearRampToValueAtTime(newFreq, now + 90); // 90 second evolution

      // Gain modulation for dynamic presence
      const gainVariation = (Math.random() - 0.5) * 6;
      const newGain = config.gain + gainVariation;

      filter.gain.cancelScheduledValues(now);
      filter.gain.setValueAtTime(filter.gain.value, now);
      filter.gain.linearRampToValueAtTime(newGain, now + 120); // 2 minute evolution
    };

    // Initial evolution after delay
    setTimeout(evolution, 15000 + index * 5000);

    // Ongoing evolution every 3-5 minutes
    setInterval(evolution, 180000 + Math.random() * 120000);
  }

  private initializeGhostSystem(): void {
    // RARE, BLENDED GHOST EVENTS: Uses rolling buffer content for non-repeatable sounds
    // Ghosts occur every 5-15 minutes and use current buffer state

    const scheduleGhost = () => {
      const now = this.audioContext.currentTime;

      // Create ghost using current buffer content at random position
      if (this.nodes.capturedSamples > this.config.bufferSize! * 0.1) {
        const startPos = Math.floor(Math.random() * (this.nodes.capturedSamples - this.audioContext.sampleRate));
        const ghostDuration = 8 + Math.random() * 12; // 8-20 seconds

        // Create ghost grain from rolling buffer
        const ghostSource = this.audioContext.createBufferSource();
        ghostSource.buffer = this.nodes.ringBuffer;

        // Spectral filtering for ghost character
        const ghostFilter = this.audioContext.createBiquadFilter();
        ghostFilter.type = 'bandpass';
        ghostFilter.frequency.setValueAtTime(300 + Math.random() * 2000, now);
        ghostFilter.Q.setValueAtTime(3 + Math.random() * 5, now);

        const ghostGain = this.audioContext.createGain();
        ghostGain.gain.setValueAtTime(0, now);
        ghostGain.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.05, now + 3); // Fade in
        ghostGain.gain.linearRampToValueAtTime(0, now + ghostDuration - 3); // Fade out

        ghostSource.connect(ghostFilter);
        ghostFilter.connect(ghostGain);
        ghostGain.connect(this.nodes.mainGain);

        try {
          ghostSource.start(now, startPos / this.audioContext.sampleRate, ghostDuration);
        } catch (error) {
          // Skip if buffer position invalid
        }
      }

      // Schedule next ghost: 5-15 minutes
      const nextGhost = 300000 + Math.random() * 600000;
      setTimeout(scheduleGhost, nextGhost);
    };

    // Initial ghost after 2-5 minutes
    setTimeout(scheduleGhost, 120000 + Math.random() * 180000);
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
