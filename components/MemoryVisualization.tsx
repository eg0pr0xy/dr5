import React, { useEffect, useState } from 'react';
import { MemoryFragment, TouchFieldState } from '../types/audio';

interface MemoryVisualizationProps {
  fragments: MemoryFragment[];
  touchField: { state: TouchFieldState; handlers: any };
  isAnimated: boolean;
}

const MemoryVisualization: React.FC<MemoryVisualizationProps> = ({ 
  fragments, touchField, isAnimated 
}) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  const [scan, setScan] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setScan(v => (v + 3) % 100), 80);
    return () => window.clearInterval(id);
  }, []);
      {/* Scan line animation */}
      <div className="absolute left-0 right-0" style={{ top: `${scan}%`, opacity: 0.15 }}>
        <div className="w-full h-[1px] bg-current"></div>
      </div>

  return (
    <div className="flex-1 w-full h-full relative border border-current border-opacity-5 bg-black/5 overflow-hidden">
      {fragments.map((f, i) => (
        <div key={i} className={`absolute transition-all whitespace-nowrap ${motionClass}`} 
             style={{ left: `${f.x}%`, top: `${f.y}%`, opacity: f.opacity, fontSize: '10px' }}>
          [ {f.content} ]
        </div>
      ))}
      
      {/* Touch field overlay */}
      <div
        className="absolute inset-0 z-20"
        style={{ touchAction: 'none' as any }}
        {...touchField.handlers}
      />
      
      {/* Touch diagnostics */}
      <div className={`absolute left-2 bottom-2 text-[9px] opacity-60 uppercase tracking-[0.2em] tabular-nums ${motionClass}`}>
        TCH_DIAG: [ WIDTH:{touchField.state.grainWidth}MS ] [ TILT:{touchField.state.tilt.toFixed(2)} ] [ DENS:{touchField.state.density.toFixed(2)} ] [ {touchField.state.isActive ? 'ACTIVE' : 'IDLE'} ]
      </div>
    </div>
  );
};

export default MemoryVisualization;
