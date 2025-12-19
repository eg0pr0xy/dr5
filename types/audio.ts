export interface MemoryEngineConfig {
  bufferSize?: number;
  grainDuration?: number;
  density?: number;
  ghostsActive?: boolean;
  pipsActive?: boolean;
  droneActive?: boolean;
}

export interface GrainScheduler {
  timer: number | null;
  lookahead: number;
  intervalMs: number;
  nextTime: number;
  grainDur: number;
  targetRate: number;
  ghostUntil: number;
  userDensity: number;
}

export interface MemoryDiagnostics {
  bufFill: number;
  grainRate: number;
  rms: number;
  lastGhost: string;
  currentStep: number;
  cutoff: number;
  q: number;
}

export interface TouchFieldState {
  isActive: boolean;
  tilt: number;
  density: number;
  grainWidth: number;
}

export interface AudioEngineNodes {
  micStream: MediaStream | null;
  processor: ScriptProcessorNode | null;
  ringBuffer: AudioBuffer;
  ringData: Float32Array;
  bufferPtr: number;
  capturedSamples: number;
  mainGain: GainNode;
  droneFilter: BiquadFilterNode;
  droneGain: GainNode;
  staticGain: GainNode;
  dustGain: GainNode;
  grainsGain: GainNode;
  windowCurve: Float32Array;
  tiltLow: BiquadFilterNode;
  tiltHigh: BiquadFilterNode;
  scheduler: GrainScheduler;
}

export interface MemoryFragment {
  x: number;
  y: number;
  content: string;
  opacity: number;
  life: number;
  isVibrating: boolean;
}

export interface MemoryModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}
