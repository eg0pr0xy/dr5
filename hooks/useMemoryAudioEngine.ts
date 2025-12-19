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
    
    const memoryEngine = new MemoryAudioEngine(audioContext, config);
    memoryEngine.setDiagnosticsCallback(setDiagnostics);
    memoryEngine.setErrorCallback(setError);
    
    memoryEngine.start()
      .then(() => {
        setEngine(memoryEngine);
        setIsInitialized(true);
      })
      .catch(err => {
        setError(err.message);
      });
    
    return () => {
      memoryEngine.dispose();
    };
  }, [audioContext]);
  
  return { engine, diagnostics, isInitialized, error };
};
