import { useEffect, useRef, useState } from 'react';
import { KHSAudioEngine } from '../engines/KHSAudioEngine';
import type { KHSState } from '../types/audio';

export const useKHSAudio = (audioContext: AudioContext | null) => {
  const engineRef = useRef<KHSAudioEngine | null>(null);
  const [diag, setDiag] = useState<KHSState>({ active: 0, centroid: 0, nextShift: 0, momentId: 0, fadePct: 0, shapeF: 0, shapeQ: 0, spectralDensity: [] });
  const [radioActive, setRadioActive] = useState(true);

  useEffect(() => {
    if (!audioContext) return;

    const startEngine = async () => {
      try {
        // Ensure AudioContext is running before starting engine
        if (audioContext.state === 'suspended') {
          console.log('useKHSAudio: Resuming suspended AudioContext');
          await audioContext.resume();
        }

        const engine = new KHSAudioEngine(audioContext);
        engine.onDiagnostics(setDiag);
        engine.start();
        engineRef.current = engine;
        console.log('useKHSAudio: KHS engine started successfully');
      } catch (error) {
        console.error('useKHSAudio: Failed to start KHS engine:', error);
      }
    };

    startEngine();

    return () => { try { engineRef.current?.dispose(); } catch {} };
  }, [audioContext]);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setRadioActive(radioActive);
  }, [radioActive]);

  return { diag, radioActive, setRadioActive };
};
