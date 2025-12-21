import React, { useEffect, useRef, useState } from 'react';
import type { KHSModeProps } from '../types/audio';
import { useKHSAudio } from '../hooks/useKHSAudio';

const KHSMode: React.FC<KHSModeProps> = ({ audioContext, isAnimated, isMobile = false }) => {
  const { diag, radioActive, setRadioActive, radioState, radioTextureLevel } = useKHSAudio(audioContext);
  const [activePermIndex, setActivePermIndex] = useState(0);
  const [matrixTick, setMatrixTick] = useState(0);
  const [currentMomentId, setCurrentMomentId] = useState(0);
  const [lastColorSwitch, setLastColorSwitch] = useState(0);
  const [isInverted, setIsInverted] = useState(false);
  const serialMatrix = useRef<number[][]>(
    Array.from({ length: 14 }, () => Array.from({ length: 14 }, () => Math.random() > 0.5 ? 1 : 0))
  );
  
  useEffect(() => {
    // Slower animation on mobile to save battery
    const delay = isMobile ? 600 : 400;
    const id = window.setInterval(() => setActivePermIndex(p => (p + 1) % 14), delay);
    return () => window.clearInterval(id);
  }, [isMobile]);
  
  // ASCII VISUALS: Only update when audio parameters actually change
  // No continuous animation - only respond to structural audio changes

  // DISCRETE VISUAL ANIMATION: Only at moment boundaries
  useEffect(() => {
    if (diag.momentId !== currentMomentId) {
      // New moment has begun - trigger discrete visual change
      setCurrentMomentId(diag.momentId);

      // Generate new serial matrix pattern based on moment characteristics
      const newMatrix = Array.from({ length: 14 }, (_, r) =>
        Array.from({ length: 14 }, (_, c) => {
          // Pattern based on moment form type and transformation
          const formSeed = diag.formType === 'punktuell' ? 1 : diag.formType === 'gruppen' ? 2 : 3;
          const transSeed = diag.transformationType === 'rotation' ? 1 : diag.transformationType === 'inversion' ? 2 : diag.transformationType === 'multiplication' ? 3 : 4;

          // Create deterministic but varied pattern
          const pattern = Math.sin((r * formSeed + c * transSeed) * 0.5) > Math.cos(r + c) * 0.3;
          return pattern ? 1 : 0;
        })
      );

      serialMatrix.current = newMatrix;

      // MEANINGFUL COLOR SWITCHING: At moment boundaries with 90s minimum interval
      const now = Date.now() / 1000; // seconds
      if (now - lastColorSwitch >= 90) {
        // 10% chance of color inversion at moment boundary
        if (Math.random() < 0.1) {
          setIsInverted(prev => !prev);
          setLastColorSwitch(now);
        }
      }
    }
  }, [diag.momentId, currentMomentId, lastColorSwitch]);

  // SERIAL INDEX ADVANCEMENT: Discrete animation trigger
  useEffect(() => {
    if (activePermIndex === 13) {
      // Serial index has wrapped - trigger minor visual update
      setMatrixTick(prev => prev + 1);
    }
  }, [activePermIndex]);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  return (
    <div className={`h-full flex flex-col p-6 overflow-hidden font-mono ${motionClass}`}>
      <header className="flex justify-between items-start text-[8px] opacity-40 uppercase tracking-[0.2em] mb-4 shrink-0">
        <div className={`flex flex-col gap-0.5 ${motionClass}`}>
          <span>43.2HZ_MASTER</span>
        </div>
        <div className={`text-right flex flex-col items-end ${motionClass}`}>
          <span>SERIAL_SYNC_OK</span>
        </div>
      </header>
      <div className={`text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums ${motionClass}`}>
        STOCKHAUSEN_DIAG: [ MOMENT:{diag.momentId} ] [ FORM:{diag.formType || 'UNK'} ] [ TRANS:{diag.transformationType || 'UNK'} ] [ ACTIVE:{diag.active} ] [ SHIFT:{diag.nextShift}s ]
      </div>
      <div className={`text-[9px] opacity-50 uppercase tracking-[0.2em] mb-2 tabular-nums ${motionClass}`}>
        RADIO_STATE: {radioState} [ TEXTURE:{(radioTextureLevel * 100).toFixed(0)}% ]
      </div>
      <div className={`flex-1 w-full h-full border border-current border-opacity-10 bg-black/5 flex flex-col p-2 ${motionClass}`}>
        <div className="flex-1 w-full h-full grid grid-cols-14 gap-1 opacity-60">
          {serialMatrix.current.map((row, rIdx) => row.map((val, cIdx) => (
            <div key={`${rIdx}-${cIdx}`} className={`h-full transition-all ${val === 1 ? 'bg-current' : 'border border-current opacity-5'} ${rIdx === activePermIndex ? 'opacity-100' : 'opacity-10'} ${motionClass}`} />
          )))}
        </div>
      </div>
      <footer className="mt-auto border-t border-current border-opacity-10 pt-4 flex justify-between items-center text-[9px]">
        <div className="flex gap-4">
          <span onClick={() => setRadioActive(!radioActive)} className="cursor-pointer underline">[ DLF_FEED ]</span>
        </div>
        <div className={`opacity-30 uppercase ${motionClass}`}>STUDIO_REV: 1954</div>
      </footer>
    </div>
  );
};

export default KHSMode;
