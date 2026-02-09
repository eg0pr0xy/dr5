import React, { useEffect, useMemo, useState } from 'react';
import type { IntensityLevel, RadioCoreDiagnostics } from '../types/audio';

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

const cycleIntensity = (prev: IntensityLevel): IntensityLevel => (
  prev === 'CALM' ? 'PRESENT' : prev === 'PRESENT' ? 'HAUNTED' : 'CALM'
);

const DroneMode: React.FC<DroneModeProps> = ({ diagnostics, isAnimated, onParams }) => {
  const [drift, setDrift] = useState(1);
  const [fm, setFm] = useState(false);
  const [sub, setSub] = useState(true);
  const [traunsteinActive, setTraunsteinActive] = useState(diagnostics.traunsteinActive);
  const [traunsteinIntensity, setTraunsteinIntensity] = useState<IntensityLevel>(diagnostics.traunsteinIntensity);
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  useEffect(() => { onParams?.({ drift }); }, [drift, onParams]);
  useEffect(() => { onParams?.({ fm }); }, [fm, onParams]);
  useEffect(() => { onParams?.({ sub }); }, [sub, onParams]);
  useEffect(() => { onParams?.({ traunsteinActive }); }, [traunsteinActive, onParams]);
  useEffect(() => { onParams?.({ traunsteinIntensity }); }, [traunsteinIntensity, onParams]);
  useEffect(() => { setTraunsteinActive(diagnostics.traunsteinActive); }, [diagnostics.traunsteinActive]);
  useEffect(() => { setTraunsteinIntensity(diagnostics.traunsteinIntensity); }, [diagnostics.traunsteinIntensity]);

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

  const mountain = useMemo(() => {
    const width = 40;
    const height = 10;
    const bars = diagnostics.bars;
    const peaks = [
      { x: 8, h: 3 + Math.round(bars[1] / 23) },
      { x: 18, h: 5 + Math.round(bars[3] / 18) + (traunsteinActive ? 2 : 0) },
      { x: 30, h: 4 + Math.round(bars[5] / 22) },
    ];
    const lines: string[] = [];
    for (let y = 0; y < height; y += 1) {
      const level = height - y;
      let line = '';
      for (let x = 0; x < width; x += 1) {
        let e = 0;
        peaks.forEach((peak) => {
          const d = Math.abs(x - peak.x);
          e = Math.max(e, Math.max(0, peak.h - d));
        });
        if (level === 1 && e > 0) {
          line += '_';
        } else if (e >= level && level > 1) {
          if (e === level) line += '^';
          else line += ((x + y + Math.floor(diagnostics.signalStrength / 8)) % 11 === 0 ? '*' : '#');
        } else {
          line += ' ';
        }
      }
      lines.push(line);
    }
    if (!traunsteinActive) {
      lines[height - 1] = '___________ TRAUNSTEIN LAYER OFF __________';
    }
    return lines;
  }, [diagnostics.bars, diagnostics.signalStrength, traunsteinActive]);

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
        DRONE_DIAG: [ CUT:{diagnostics.cutoff}HZ ] [ Q:{diagnostics.resonance.toFixed(1)} ] [ SIGNAL:{diagnostics.signalStrength}% ] [ TRAUNSTEIN:{traunsteinActive ? 'ON' : 'OFF'} ] [ INT:{traunsteinIntensity} ]
      </div>
      <div className="flex-1 border border-current border-opacity-20 p-3 text-[11px] leading-[1.2] overflow-hidden flex flex-col gap-2">
        <div className="flex-1 overflow-hidden">
          {matrix.map((line, i) => (
            <div key={i} className="whitespace-pre">{line}</div>
          ))}
        </div>
        <div className="border-t border-current border-opacity-20 pt-2 text-[10px] leading-[1.1] overflow-hidden">
          <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-1">TRAUNSTEIN_ASCII</div>
          {mountain.map((line, i) => (
            <div key={i} className="whitespace-pre">{line}</div>
          ))}
        </div>
      </div>
      <footer className="mt-3 border-t border-current border-opacity-20 pt-3 flex gap-4 text-[10px]">
        <span className="cursor-pointer" onClick={() => setDrift((v) => (v + 1) % 5)}>[ DRIFT:{drift} ]</span>
        <span className={`cursor-pointer ${fm ? 'underline' : 'opacity-50'}`} onClick={() => setFm((v) => !v)}>[ FM ]</span>
        <span className={`cursor-pointer ${sub ? 'underline' : 'opacity-50'}`} onClick={() => setSub((v) => !v)}>[ SUB ]</span>
        <span className={`cursor-pointer ${traunsteinActive ? 'underline' : 'opacity-50'}`} onClick={() => setTraunsteinActive((v) => !v)}>[ TRAUNSTEIN ]</span>
        <span className="cursor-pointer" onClick={() => setTraunsteinIntensity((prev) => cycleIntensity(prev))}>[ INTENSITY:{traunsteinIntensity} ]</span>
      </footer>
    </div>
  );
};

export default DroneMode;
