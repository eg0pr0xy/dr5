import React, { useEffect, useState } from 'react';
import type { GenerativeDiagnostics } from '../types/audio';

interface GenerativeModeProps {
  diagnostics: GenerativeDiagnostics;
  isAnimated?: boolean;
  onParams?: (params: Record<string, unknown>) => void;
}

const GenerativeMode: React.FC<GenerativeModeProps> = ({ diagnostics, isAnimated, onParams }) => {
  const [rule, setRule] = useState<30 | 110>(diagnostics.rule);
  const [invert, setInvert] = useState(diagnostics.invert);
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  useEffect(() => { onParams?.({ rule }); }, [rule, onParams]);
  useEffect(() => { onParams?.({ invert }); }, [invert, onParams]);
  useEffect(() => { setRule(diagnostics.rule); }, [diagnostics.rule]);
  useEffect(() => { setInvert(diagnostics.invert); }, [diagnostics.invert]);

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>RECURSIVE_FIELD</span>
        <span>RULE_{rule}</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        GEN_DIAG: [ INVERT:{invert ? 'ON' : 'OFF'} ] [ BANDS:{diagnostics.bandAmps.map((x) => x.toFixed(2)).join('|')} ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 text-[11px] leading-[1.15] overflow-hidden">
        {diagnostics.rows.map((line, i) => (
          <div key={i} className="whitespace-pre">{line}</div>
        ))}
      </div>
      <footer className="mt-3 border-t border-current border-opacity-20 pt-3 flex gap-4 text-[10px]">
        <span className="cursor-pointer" onClick={() => setRule((prev) => (prev === 110 ? 30 : 110))}>[ RULE ]</span>
        <span className={`cursor-pointer ${invert ? 'underline' : 'opacity-50'}`} onClick={() => setInvert((v) => !v)}>[ INVERT ]</span>
      </footer>
    </div>
  );
};

export default GenerativeMode;
