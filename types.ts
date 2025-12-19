
export enum Mode {
  DRONE = 'DRONE',
  ENVIRON = 'ENVIRON',
  MEMORY = 'MEMORY',
  GENERATIVE = 'GENERATIVE',
  ORACLE = 'ORACLE',
  KHS = 'KHS'
}

export enum Theme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  CUSTOM = 'CUSTOM'
}

export interface UIState {
  isAnimated: boolean;
  isInverted: boolean;
  contrast: number;
}

export interface DroneState {
  oscillators: number[];
  filterCutoff: number;
  modulationDepth: number;
  noiseLevel: number;
  entropy: number;
}
