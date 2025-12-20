import React from 'react';
import { MemoryAudioEngine } from '../engines/MemoryAudioEngine';
import { MemoryDiagnostics } from '../types/audio';

interface MemoryFooterProps {
  engine: MemoryAudioEngine | null;
  diagnostics: MemoryDiagnostics | null;
  isAnimated: boolean;
  isMobile?: boolean;
}

const MemoryFooter: React.FC<MemoryFooterProps> = ({ 
  engine, diagnostics, isAnimated, isMobile = false 
}) => {
  const [ghostsActive, setGhostsActive] = React.useState(true);
  const [droneActive, setDroneActive] = React.useState(true);
  const [statusText, setStatusText] = React.useState("ROOM_IS_EMPTY");
  
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  
  React.useEffect(() => {
    if (engine) {
      engine.setGhostState(ghostsActive);
      engine.setDroneState(droneActive);
    }
  }, [engine, ghostsActive, droneActive]);
  
  if (!diagnostics) {
    return (
      <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
        <div className="flex gap-4">
          <span className="text-[10px] cursor-pointer opacity-40">[ GHOSTS ]</span>
          <span className="text-[10px] cursor-pointer opacity-40">[ STATIC ]</span>
        </div>
        <div className={`text-[9px] opacity-40 uppercase ${motionClass}`}>{statusText}</div>
      </footer>
    );
  }
  
  return (
    <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
      <div className="flex gap-4">
        <span onClick={() => setGhostsActive(!ghostsActive)} 
              className={`text-[10px] cursor-pointer ${ghostsActive ? 'underline' : 'opacity-40'}`}>
          [ GHOSTS ]
        </span>
        <span onClick={() => setDroneActive(!droneActive)} 
              className={`text-[10px] cursor-pointer ${droneActive ? 'underline' : 'opacity-40'}`}>
          [ STATIC ]
        </span>
      </div>
      <div className={`text-[9px] opacity-40 uppercase ${motionClass}`}>
        {statusText}
      </div>
    </footer>
  );
};

export default MemoryFooter;
