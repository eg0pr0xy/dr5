import React from 'react';
import { MemoryFragment, TouchFieldState } from '../types/audio';

interface MemoryVisualizationProps {
  fragments: MemoryFragment[];
  touchField: { state: TouchFieldState; handlers: any };
  isAnimated: boolean;
}

const MemoryVisualization: React.FC<MemoryVisualizationProps> = ({
  fragments,
  touchField,
  isAnimated,
}) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className="flex-1 w-full h-full relative border border-current border-opacity-5 bg-black/5 overflow-hidden">
      {fragments.map((fragment, i) => (
        <div
          key={i}
          className={`absolute whitespace-nowrap ${motionClass}`}
          style={{ left: `${fragment.x}%`, top: `${fragment.y}%`, opacity: fragment.opacity, fontSize: '10px' }}
        >
          [ {fragment.content} ]
        </div>
      ))}
      <div className="absolute inset-0 z-20" style={{ touchAction: 'none' as any }} {...touchField.handlers} />
      <div className={`absolute left-2 bottom-2 text-[9px] opacity-60 uppercase tracking-[0.2em] tabular-nums ${motionClass}`}>
        TCH_DIAG: [ WIDTH:{touchField.state.grainWidth}MS ] [ TILT:{touchField.state.tilt.toFixed(2)} ] [ DENS:{touchField.state.density.toFixed(2)} ] [ {touchField.state.isActive ? 'ACTIVE' : 'IDLE'} ]
      </div>
    </div>
  );
};

export default MemoryVisualization;
