import { Mode } from '../types';

export type ModeOutputState = 'ACTIVE' | 'SILENT' | 'FALLBACK';
export type IntensityLevel = 'CALM' | 'PRESENT' | 'HAUNTED';

export interface ModeAudioContract {
  outDb?: number;
  modeOut?: ModeOutputState;
  fallback?: boolean;
  fallbackReason?: string | null;
}

export interface RadioCoreDiagnostics extends ModeAudioContract {
  bars: number[];
  cutoff: number;
  resonance: number;
  stepType: string;
  signalStrength: number;
  traunsteinActive: boolean;
  traunsteinIntensity: IntensityLevel;
}

export interface EnvironDiagnostics extends ModeAudioContract {
  matrix: string[];
  activeCells: number;
  roomFlux: number;
  pressure: number;
}

export interface MemoryDiagnostics extends ModeAudioContract {
  rms?: number;
  source?: 'MIC' | 'FALLBACK';
  grainRate?: number;
  feedback?: number;
  ghostUntil?: number;
  f0?: number;
  memorySec?: number;
  reverbMix?: number;
  bufFill?: number;
  lastGhost?: string;
  currentStep?: number;
  cutoff?: number;
  q?: number;
}

export interface GenerativeDiagnostics extends ModeAudioContract {
  rows: string[];
  rule: 30 | 110;
  invert: boolean;
  bandAmps: number[];
}

export interface OracleDiagnostics extends ModeAudioContract {
  rms: number;
  source: 'MIC' | 'FALLBACK';
  hexagram: number[];
  text: string;
  matrix24x8: string[];
  densityGlyph: '░' | '▒' | '▓' | '█';
  phaseStep: number;
  concreteIntensity: IntensityLevel;
}

export type SpectralBias = 'LOW' | 'MID' | 'HIGH';

export interface KHSDiagnostics extends ModeAudioContract {
  momentIndex: number;
  momentTotal: number;
  spectralBias: SpectralBias;
  densityGlyph: '░' | '▒' | '▓' | '█';
  widthBar: string;
  transitionProgress: number;
  nextBoundarySec: number;
  matrix24x8: string[];
}

export interface ModeDiagnosticsMap {
  [Mode.DRONE]: RadioCoreDiagnostics;
  [Mode.ENVIRON]: EnvironDiagnostics;
  [Mode.MEMORY]: MemoryDiagnostics;
  [Mode.GENERATIVE]: GenerativeDiagnostics;
  [Mode.ORACLE]: OracleDiagnostics;
  [Mode.KHS]: KHSDiagnostics;
}

export interface AudioDirectorSnapshot {
  activeMode: Mode | null;
  audioState: AudioContextState;
  outDb: number;
  modeOut: ModeOutputState;
  fallback: boolean;
  fallbackReason: string | null;
  mode: ModeDiagnosticsMap;
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
  isAnimated?: boolean;
  embedded?: boolean;
}

export interface TouchFieldState {
  isActive: boolean;
  tilt: number;
  density: number;
  grainWidth: number;
}

// Legacy compatibility types (older modules still in repo).
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

export interface AudioEngineNodes {
  micStream: MediaStream | null;
  processor: ScriptProcessorNode | null;
  workletNode?: AudioWorkletNode | null;
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
  internalWriter?: number | null;
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
}

export interface KHSModeProps {
  isAnimated?: boolean;
  embedded?: boolean;
}

