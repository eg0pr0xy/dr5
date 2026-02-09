import React from 'react';
import type { EnvironDiagnostics } from '../types/audio';

interface EnvironModeProps {
  diagnostics: EnvironDiagnostics;
  isAnimated?: boolean;
}

const EnvironMode: React.FC<EnvironModeProps> = ({ diagnostics, isAnimated }) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>ENVIRON_FIELD</span>
        <span>PRESS:{(diagnostics.pressure * 100).toFixed(0)}%</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        ENV_DIAG: [ CELLS:{diagnostics.activeCells} ] [ FLUX:{diagnostics.roomFlux.toFixed(4)} ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 text-[11px] leading-[1.15] overflow-hidden">
        {diagnostics.matrix.map((line, i) => (
          <div key={i} className="whitespace-pre">{line}</div>
        ))}
      </div>
    </div>
  );
};

export default EnvironMode;
