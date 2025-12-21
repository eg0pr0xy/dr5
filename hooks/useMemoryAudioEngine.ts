import { useState, useEffect } from 'react';
import { MemoryAudioEngine } from '../engines/MemoryAudioEngine';
import { MemoryEngineConfig, MemoryDiagnostics } from '../types/audio';

export const useMemoryAudioEngine = (
  audioContext: AudioContext | null,
  config?: MemoryEngineConfig
) => {
  const [engine, setEngine] = useState<MemoryAudioEngine | null>(null);
  const [diagnostics, setDiagnostics] = useState<MemoryDiagnostics | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!audioContext) return;

    const startEngine = async () => {
      try {
        // Ensure AudioContext is running before starting engine
        if (audioContext.state === 'suspended') {
          console.log('useMemoryAudioEngine: Resuming suspended AudioContext');
          await audioContext.resume();
        }

        const memoryEngine = new MemoryAudioEngine(audioContext, config);
        memoryEngine.setDiagnosticsCallback(setDiagnostics);
        memoryEngine.setErrorCallback(setError);

        await memoryEngine.start();
        setEngine(memoryEngine);
        setIsInitialized(true);
        console.log('useMemoryAudioEngine: Memory engine started successfully');
      } catch (err) {
        console.error('useMemoryAudioEngine: Failed to start Memory engine:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    startEngine();

    return () => {
      if (engine) {
        engine.dispose();
      }
    };
  }, [audioContext]);
  
  return { engine, diagnostics, isInitialized, error };
};
