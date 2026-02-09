import React from 'react';
import { useMemoryFragments } from '../hooks/useMemoryFragments';
import type { MemoryDiagnostics } from '../types/audio';

interface MemoryModeProps {
  diagnostics: MemoryDiagnostics;
  isAnimated?: boolean;
  onParams?: (params: Record<string, unknown>) => void;
}

const MemoryMode: React.FC<MemoryModeProps> = ({ diagnostics, isAnimated, onParams }) => {
  const fragments = useMemoryFragments();
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>PREPARED_ROOM</span>
        <span>SRC:{diagnostics.source}</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        MEM_DIAG: [ RMS:{diagnostics.rms.toFixed(3)} ] [ GRAIN:{diagnostics.grainRate}HZ ] [ FDBK:{diagnostics.feedback.toFixed(2)} ] [ F0:{diagnostics.f0}HZ ] [ GHOST:{diagnostics.ghostUntil}s ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 overflow-hidden relative">
        {fragments.slice(-22).map((fragment, i) => (
          <div
            key={`${fragment.content}-${i}`}
            className="absolute text-[10px] uppercase whitespace-nowrap"
            style={{
              left: `${fragment.x}%`,
              top: `${fragment.y}%`,
              opacity: Math.max(0.1, fragment.opacity),
            }}
          >
            [ {fragment.content} ]
          </div>
        ))}
      </div>
      <footer className="mt-3 border-t border-current border-opacity-20 pt-3 flex gap-4 text-[10px]">
        <span className="cursor-pointer" onClick={() => onParams?.({ ghostPulse: true })}>[ GHOST_PULSE ]</span>
        <span className="cursor-pointer" onClick={() => onParams?.({ densityStep: true })}>[ DENSITY_STEP ]</span>
      </footer>
    </div>
  );
};

export default MemoryMode;
