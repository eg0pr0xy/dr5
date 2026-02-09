import React, { useEffect, useState } from 'react';
import type { OracleDiagnostics } from '../types/audio';

interface OracleModeProps {
  diagnostics: OracleDiagnostics;
  isAnimated?: boolean;
  onParams?: (params: Record<string, unknown>) => void;
}

const OracleMode: React.FC<OracleModeProps> = ({ diagnostics, isAnimated, onParams }) => {
  const [highSens, setHighSens] = useState(false);
  const [intensity, setIntensity] = useState<'CALM' | 'PRESENT' | 'HAUNTED'>(diagnostics.concreteIntensity);
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  const phaseGlyph = ['.', ':', '*', '+'][diagnostics.phaseStep % 4];
  const wingL = ['<', '[', '{', '('][diagnostics.phaseStep % 4];
  const wingR = ['>', ']', '}', ')'][diagnostics.phaseStep % 4];
  const densityBar = diagnostics.densityGlyph.repeat(Math.max(1, Math.min(4, Math.floor((diagnostics.rms * 22) + 1))));

  useEffect(() => { onParams?.({ highSens }); }, [highSens, onParams]);
  useEffect(() => { onParams?.({ concreteIntensity: intensity }); }, [intensity, onParams]);
  useEffect(() => { setIntensity(diagnostics.concreteIntensity); }, [diagnostics.concreteIntensity]);

  const cycleIntensity = () => {
    setIntensity((prev) => (prev === 'CALM' ? 'PRESENT' : prev === 'PRESENT' ? 'HAUNTED' : 'CALM'));
  };

  const lineToAscii = (line: number, idx: number) => {
    const pulse = ((diagnostics.phaseStep + idx) % 3) + 1;
    if (line === 1) {
      return `${wingL}${phaseGlyph.repeat(pulse)}----------${phaseGlyph.repeat(pulse)}${wingR}`;
    }
    return `${wingL}${phaseGlyph.repeat(pulse)}----- -----${phaseGlyph.repeat(pulse)}${wingR}`;
  };

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>ORACLE</span>
        <span>SRC:{diagnostics.source}</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        ORACLE_DIAG: [ RMS:{diagnostics.rms.toFixed(3)} ] [ DENS:{diagnostics.densityGlyph} ] [ PHASE:{diagnostics.phaseStep % 100} ] [ INT:{intensity} ] [ MSG:{diagnostics.text} ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-col justify-center gap-1">
          {diagnostics.hexagram.map((line, i) => (
            <div key={i} className="text-center tracking-[0.35em] text-[11px] whitespace-pre">
              {lineToAscii(line, i)}
            </div>
          ))}
        </div>
        <div className="border-t border-current border-opacity-20 pt-2 text-[9px] opacity-70 uppercase tracking-[0.2em]">
          MATRIX_24x8 [ {densityBar} ]
        </div>
        <div className="text-[10px] leading-[1.1] overflow-hidden">
          {diagnostics.matrix24x8.map((line, i) => (
            <div key={i} className="whitespace-pre">{line}</div>
          ))}
        </div>
      </div>
      <footer className="mt-3 border-t border-current border-opacity-20 pt-3 flex gap-4 text-[10px]">
        <span className={`cursor-pointer ${highSens ? 'underline' : 'opacity-50'}`} onClick={() => setHighSens((v) => !v)}>[ HI_SENS ]</span>
        <span className="cursor-pointer" onClick={() => onParams?.({ throw: true })}>[ THROW_COINS ]</span>
        <span className="cursor-pointer" onClick={cycleIntensity}>[ INTENSITY:{intensity} ]</span>
      </footer>
    </div>
  );
};

export default OracleMode;
