import React from 'react';
import { MemoryModeProps } from '../types/audio';
import { useMemoryAudioEngine } from '../hooks/useMemoryAudioEngine';
import { useMemoryFragments } from '../hooks/useMemoryFragments';
import { useTouchField } from '../hooks/useTouchField';
import MemoryHeader from './MemoryHeader';
import MemoryVisualization from './MemoryVisualization';
import MemoryFooter from './MemoryFooter';

const MemoryMode: React.FC<MemoryModeProps> = ({ audioContext, isAnimated, embedded, isMobile = false }) => {
  const { engine, diagnostics, isInitialized, error } = useMemoryAudioEngine(audioContext);

  // Extract audio parameters for synchronized text generation
  const audioParams = diagnostics ? {
    spectralCentroid: 50, // We don't have direct spectral centroid, use approximation
    rms: diagnostics.rms,
    grainRate: diagnostics.grainRate,
    currentF0: diagnostics.f0
  } : {
    // Provide fallback values when diagnostics aren't available yet
    spectralCentroid: 50,
    rms: 0.05,
    grainRate: 8,
    currentF0: 110
  };

  const fragments = useMemoryFragments(audioParams);
  const touchField = useTouchField(engine);
  
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  
  if (!isInitialized) {
    return (
      <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[10px] opacity-40">INITIALIZING...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[10px] opacity-40">ERROR: {error}</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
      
      <MemoryVisualization 
        fragments={fragments} 
        touchField={touchField}
        isAnimated={isAnimated}
        isMobile={isMobile}
      />
      <MemoryFooter 
        engine={engine} 
        diagnostics={diagnostics}
        isAnimated={isAnimated}
        isMobile={isMobile}
      />
    </div>
  );
};

export default MemoryMode;
