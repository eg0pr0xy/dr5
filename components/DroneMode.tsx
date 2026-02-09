import React, { useEffect, useMemo, useState } from 'react';
import type { RadioCoreDiagnostics } from '../types/audio';

interface DroneModeProps {
  diagnostics: RadioCoreDiagnostics;
  isAnimated?: boolean;
  onParams?: (params: Record<string, unknown>) => void;
}

const CHAR_SETS = [
  ['.', ':', '░', '▒', '▓', '█'],
  ['.', 'o', '0', 'O', '#', '@'],
  ['.', '-', '=', '+', '#', '█'],
  ['.', '\'', '^', '*', 'x', '█'],
  ['.', '.', ':', ';', '!', '█'],
  ['.', 'i', 'l', 'I', 'H', '█'],
  ['.', ':', '░', '▒', '▓', '█'],
];

const DroneMode: React.FC<DroneModeProps> = ({ diagnostics, isAnimated, onParams }) => {
  const [drift, setDrift] = useState(1);
  const [fm, setFm] = useState(false);
  const [sub, setSub] = useState(true);
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  useEffect(() => { onParams?.({ drift }); }, [drift, onParams]);
  useEffect(() => { onParams?.({ fm }); }, [fm, onParams]);
  useEffect(() => { onParams?.({ sub }); }, [sub, onParams]);

  const matrix = useMemo(() => {
    const rows = 12;
    return new Array(rows).fill(0).map((_, r) => {
      const threshold = ((rows - r) / rows) * 100;
      return diagnostics.bars.map((value, c) => {
        const level = Math.max(0, value - threshold);
        const idx = Math.min(5, Math.floor(level / 20));
        return value >= threshold ? CHAR_SETS[c][idx] : '.';
      }).join(' ');
    });
  }, [diagnostics.bars]);

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden font-mono ${motionClass}`}>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums">
        OUT:{diagnostics.outDb.toFixed(1)}dB MODE_OUT:{diagnostics.modeOut}
      </div>
      <header className="text-[9px] opacity-45 uppercase tracking-[0.25em] mb-3 flex justify-between">
        <span>RADIO_CORE</span>
        <span>STEP:{diagnostics.stepType}</span>
      </header>
      <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
        DRONE_DIAG: [ CUT:{diagnostics.cutoff}HZ ] [ Q:{diagnostics.resonance.toFixed(1)} ] [ SIGNAL:{diagnostics.signalStrength}% ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 text-[11px] leading-[1.2] overflow-hidden">
        {matrix.map((line, i) => (
          <div key={i} className="whitespace-pre">{line}</div>
        ))}
      </div>
      <footer className="mt-3 border-t border-current border-opacity-20 pt-3 flex gap-4 text-[10px]">
        <span className="cursor-pointer" onClick={() => setDrift((v) => (v + 1) % 5)}>[ DRIFT:{drift} ]</span>
        <span className={`cursor-pointer ${fm ? 'underline' : 'opacity-50'}`} onClick={() => setFm((v) => !v)}>[ FM ]</span>
        <span className={`cursor-pointer ${sub ? 'underline' : 'opacity-50'}`} onClick={() => setSub((v) => !v)}>[ SUB ]</span>
      </footer>
    </div>
  );
};

export default DroneMode;
