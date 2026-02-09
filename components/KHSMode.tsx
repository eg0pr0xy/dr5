import React from 'react';
import type { KHSDiagnostics } from '../types/audio';

interface KHSModeProps {
  diagnostics: KHSDiagnostics;
  isAnimated?: boolean;
}

const KHSMode: React.FC<KHSModeProps> = ({ diagnostics, isAnimated }) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>STOCKHAUSEN_MOMENTS</span>
        <span>MOMENT INDEX:{diagnostics.momentIndex.toString().padStart(2, '0')}/{diagnostics.momentTotal.toString().padStart(2, '0')}</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        KHS_DIAG: [ SPECTRAL BIAS:{diagnostics.spectralBias} ] [ DENSITY:{diagnostics.densityGlyph} ] [ WIDTH:{diagnostics.widthBar} ] [ TRANS:{diagnostics.transitionProgress}% ] [ NEXT:{diagnostics.nextBoundarySec}s ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 text-[11px] leading-[1.15] overflow-hidden">
        <div className="text-[9px] opacity-50 uppercase mb-2">ASCII_DENSITY_MATRIX_24x8</div>
        {diagnostics.matrix24x8.map((line, i) => (
          <div key={i} className="whitespace-pre">{line}</div>
        ))}
      </div>
    </div>
  );
};

export default KHSMode;
