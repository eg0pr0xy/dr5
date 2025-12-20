import React, { useEffect, useRef, useState } from 'react';
import type { KHSModeProps } from '../types/audio';
import { useKHSAudio } from '../hooks/useKHSAudio';

const KHSMode: React.FC<KHSModeProps> = ({ audioContext, isAnimated, isMobile = false }) => {
  const { diag, radioActive, setRadioActive } = useKHSAudio(audioContext);
  const [activePermIndex, setActivePermIndex] = useState(0);
  const [matrixTick, setMatrixTick] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const serialMatrix = useRef<number[][]>(
    Array.from({ length: 14 }, () => Array.from({ length: 14 }, () => Math.random() > 0.5 ? 1 : 0))
  );
  
  useEffect(() => {
    // Slower animation on mobile to save battery
    const delay = isMobile ? 600 : 400;
    const id = window.setInterval(() => setActivePermIndex(p => (p + 1) % 14), delay);
    return () => window.clearInterval(id);
  }, [isMobile]);
  
  // Complex ASCII animation: ripple + random twinkle based on moment state
  useEffect(() => {
    const animate = () => {
      const m = serialMatrix.current;
      const t = matrixTick + (diag.momentId % 7);
      for (let r = 0; r < 14; r++) {
        for (let c = 0; c < 14; c++) {
          const phase = (r + c + t) % 7;
          const base = phase < 3 ? 1 : 0;
          const twinkle = Math.random() < 0.02 ? 1 : 0;
          m[r][c] = base || twinkle ? 1 : 0;
        }
      }
      setMatrixTick((v) => (v + 1) % 1000);
    };

    // Use requestAnimationFrame for smoother mobile performance
    const updateMatrix = () => {
      animate();
      animationFrameRef.current = requestAnimationFrame(updateMatrix);
    };
    
    // Slower update rate on mobile to save battery
    const updateDelay = isMobile ? 180 : 120;
    const id = window.setInterval(() => {
      animate();
    }, updateDelay);

    return () => {
      clearInterval(id);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [diag.momentId, matrixTick, isMobile]);

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
        KHS_DIAG: [ MOM:{diag.momentId} ] [ FADE:{diag.fadePct}% ] [ PARTIALS:{diag.active} ] [ CENTROID:{Math.round(diag.centroid)}HZ ] [ NEXT_SHIFT:{diag.nextShift}s ]
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
