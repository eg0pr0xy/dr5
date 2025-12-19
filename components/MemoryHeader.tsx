import React from 'react';
import { MemoryDiagnostics } from '../types/audio';

interface MemoryHeaderProps {
  diagnostics: MemoryDiagnostics | null;
  isAnimated: boolean;
  fragments?: any[]; // Add fragments prop
}

const MemoryHeader: React.FC<MemoryHeaderProps> = ({ diagnostics, isAnimated, fragments }) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  
  if (!diagnostics) return null;
  
  return (
    <>
      <header className="flex justify-between items-end text-[9px] opacity-40 mb-8 shrink-0 tracking-[0.3em]">
        <div className={`flex flex-col ${motionClass}`}>
          <span>MODE: PREPARED_ROOM</span>
          <span>STEP: [0{diagnostics.currentStep + 1}/08]</span>
        </div>
        <div className={`text-right ${motionClass}`}>
          <span>FRAGMENTS: {fragments?.length || 0}</span>
        </div>
      </header>
      
      <div className={`text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums ${motionClass}`}>
        MEM_DIAG: [ BUF:{diagnostics.bufFill}% ] [ GRAIN:{diagnostics.grainRate}HZ ] [ RMS:{diagnostics.rms} ] [ LAST_GHOST:{diagnostics.lastGhost} ]
      </div>
    </>
  );
};

export default MemoryHeader;
