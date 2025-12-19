import { MemoryEngineConfig, MemoryDiagnostics, GrainScheduler, AudioEngineNodes } from '../types/audio';

export class MemoryAudioEngine {
  private audioContext: AudioContext;
  private config: MemoryEngineConfig;
  private nodes: AudioEngineNodes;
  private ambientRms: number = 0;
  private currentStep: number = 0;
  
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
      grainDuration: 0.16,
      density: 0.5,
      ghostsActive: true,
      pipsActive: true,
      droneActive: true,
      ...config
    };
    
    this.nodes = this.initializeAudioNodes();
    this.startAudioSources();
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
    tiltLow.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    const tiltHigh = this.audioContext.createBiquadFilter();
    tiltHigh.type = 'highshelf';
    tiltHigh.frequency.setValueAtTime(4000, this.audioContext.currentTime);
    tiltHigh.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    // Connect grain chain
    grainsGain.connect(tiltLow);
    tiltLow.connect(tiltHigh);
    tiltHigh.connect(mainGain);
    
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
      scheduler
    };
  }
  
  private startAudioSources(): void {
    // Create and start noise sources
    const noiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 2, this.audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    
    const dustBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 4, this.audioContext.sampleRate);
    const dustData = dustBuffer.getChannelData(0);
    for (let i = 0; i < dustData.length; i++) if (Math.random() > 0.9997) dustData[i] = (Math.random()*2-1)*0.4;
    
    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    
    const dustSource = this.audioContext.createBufferSource();
    dustSource.buffer = dustBuffer;
    dustSource.loop = true;
    
    // Create static filter
    const staticFilter = this.audioContext.createBiquadFilter();
    staticFilter.type = 'highpass';
    staticFilter.frequency.setValueAtTime(4500, this.audioContext.currentTime);
    
    // Connect noise sources
    noiseSource.connect(this.nodes.droneFilter);
    this.nodes.droneFilter.connect(this.nodes.droneGain);
    this.nodes.droneGain.connect(this.nodes.mainGain);
    
    noiseSource.connect(staticFilter);
    staticFilter.connect(this.nodes.staticGain);
    this.nodes.staticGain.connect(this.nodes.mainGain);
    
    dustSource.connect(this.nodes.dustGain);
    this.nodes.dustGain.connect(this.nodes.mainGain);
    
    noiseSource.start();
    dustSource.start();
  }
  
  async start(): Promise<void> {
    try {
      await this.startMicrophone();
      this.startGrainScheduler();
      this.startGhostScheduler();
      this.startDiagnosticsUpdater();
      this.startParameterSequencer();
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }
  
  private async startMicrophone(): Promise<void> {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.nodes.micStream = micStream;

    const source = this.audioContext.createMediaStreamSource(micStream);

    // Prefer AudioWorklet for low-latency capture
    const base = (import.meta as any).env?.BASE_URL || '/';
    try {
      // Register worklet and create node
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
        // write to ring
        for (let i = 0; i < input.length; i++) {
          this.nodes.ringData[this.nodes.bufferPtr] = input[i];
          this.nodes.bufferPtr = (this.nodes.bufferPtr + 1) % bufferSize;
          if (this.nodes.capturedSamples < bufferSize) this.nodes.capturedSamples++;
        }
        // update RMS from processor
        if (typeof msg.rms === 'number') this.ambientRms = msg.rms;
      };
      source.connect(worklet);
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
    // do NOT route processor to destination to avoid echo; connect to a dummy gain if needed
    const nullGain = this.audioContext.createGain();
    nullGain.gain.setValueAtTime(0, this.audioContext.currentTime);
    processor.connect(nullGain);
    nullGain.connect(this.audioContext.destination);
    this.nodes.processor = processor;
  }
  
  private startGrainScheduler(): void {
    const scheduleGrain = (when: number) => {
      const ctx = this.audioContext;
      const { ringBuffer, grainsGain, windowCurve } = this.nodes;
      const sr = ctx.sampleRate;
      const dur = this.nodes.scheduler.grainDur;
      const bufLenSec = ringBuffer.length / sr;
      const filledSec = Math.min(this.nodes.capturedSamples, ringBuffer.length) / sr;
      
      const biasRecent = 0.35;
      const isGhost = when < this.nodes.scheduler.ghostUntil;
      const bias = isGhost ? 0.8 : biasRecent;
      
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
      
      const baseRate = 4 + Math.min(0.5, Math.max(0, this.ambientRms)) * 40;
      const userTarget = 4 + (sched.userDensity * 28);
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
  
  private startGhostScheduler(): void {
    if (!this.config.ghostsActive) return;
    
    const formatTimeHMS = (t: number) => {
      const d = new Date(t);
      const p = (n: number) => n.toString().padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    
    const scheduleGhost = () => {
      const now = this.audioContext.currentTime;
      const dur = 0.6 + Math.random() * 0.9;
      this.nodes.scheduler.ghostUntil = now + dur;
      
      if (this.onDiagnosticsUpdate) {
        const currentDiag = this.getDiagnostics();
        this.onDiagnosticsUpdate({
          ...currentDiag,
          lastGhost: formatTimeHMS(Date.now())
        });
      }
      
      this.ghostId = window.setTimeout(scheduleGhost, 8000 + Math.random() * 12000) as unknown as number;
    };
    
    this.ghostId = window.setTimeout(scheduleGhost, 5000 + Math.random() * 8000) as unknown as number;
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
        lastGhost: '--:--:--',
        currentStep: this.currentStep,
        cutoff: this.FREQ_STEPS[this.currentStep],
        q: this.Q_STEPS[this.currentStep]
      };
      
      this.onDiagnosticsUpdate?.(diagnostics);
    }, 500);
  }
  
  private startParameterSequencer(): void {
    let lastStepTime = 0;
    
    const scheduleNextEvent = () => {
      const time = this.audioContext.currentTime;
      if (time - lastStepTime > 1.5) {
        lastStepTime = time;
        this.currentStep = (this.currentStep + 1) % this.FREQ_STEPS.length;
        
        this.nodes.droneFilter.frequency.setTargetAtTime(
          this.FREQ_STEPS[this.currentStep], 
          time, 
          0.02
        );
        this.nodes.droneFilter.Q.setTargetAtTime(
          this.Q_STEPS[this.currentStep], 
          time, 
          0.02
        );
      }
      
      this.stepTimeoutId = window.setTimeout(scheduleNextEvent, 400 + Math.random() * 2000) as unknown as number;
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
      lastGhost: '--:--:--',
      currentStep: this.currentStep,
      cutoff: this.FREQ_STEPS[this.currentStep],
      q: this.Q_STEPS[this.currentStep]
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
