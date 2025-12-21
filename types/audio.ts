export interface MemoryEngineConfig {
  bufferSize?: number;
  grainDuration?: number;
  density?: number;
  ghostsActive?: boolean;
  pipsActive?: boolean;
  droneActive?: boolean;
}

export interface AudioEngineNodes {
  micStream: MediaStream | null;
  processor: ScriptProcessorNode | null;
  workletNode?: AudioWorkletNode | null;
   internalWriter?: number | null;
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
  grainsLpf?: BiquadFilterNode;
  resonators?: BiquadFilterNode[];
  resWet?: GainNode;
  resDry?: GainNode;
  scheduler: GrainScheduler;
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
  f0?: number;
}

export interface KHSState {
  active: number;
  centroid: number;
  nextShift: number;
  momentId: number;
  fadePct: number;
  shapeF: number;
  shapeQ: number;
  spectralDensity: number[];
  formType?: 'punktuell' | 'gruppen' | 'statistisch';
  transformationType?: 'rotation' | 'inversion' | 'multiplication' | 'division';
}

export interface MemoryModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
  embedded?: boolean;
  isMobile?: boolean;
}

export interface MemoryFragment {
  x: number;
  y: number;
  content: string;
  opacity: number;
  life: number;
  isVibrating: boolean;
}

export interface KHSModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
  embedded?: boolean;
  isMobile?: boolean;
}

export interface TouchFieldState {
  isActive: boolean;
  tilt: number;      // -1..1
  density: number;   // 0..1
  grainWidth: number; // ms
}
