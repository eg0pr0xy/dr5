
import React, { useState, useEffect } from 'react';
import { Theme } from '../types';

interface StatusBarProps {
  theme: Theme;
}

const StatusBar: React.FC<StatusBarProps> = ({ theme }) => {
  const [time, setTime] = useState({ h: 9, m: 41, s: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(prev => {
        let { h, m, s } = prev;
        s--;
        if (s < 0) {
          s = 59;
          m--;
        }
        if (m < 0) {
          m = 59;
          h--;
        }
        if (h < 0) {
          h = 23;
        }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const format = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className="absolute top-0 left-0 right-0 h-10 px-6 flex justify-between items-center text-xs font-bold z-50 opacity-60 animate-[pulse-glow_10s_ease-in-out_infinite]">
      <div className="flex-1 tabular-nums tracking-tighter">
        {format(time.h)}:{format(time.m)}:{format(time.s)}
      </div>
      <div className="flex gap-3 items-center">
        {/* Signal dots with micro-animations */}
        <div className="flex gap-[1px] items-end h-3">
          <div className="w-[3px] h-[3px] bg-current animate-[pulse_0.8s_steps(2)_infinite]"></div>
          <div className="w-[3px] h-[5px] bg-current opacity-80 animate-[pulse_1.2s_steps(2)_infinite_0.2s]"></div>
          <div className="w-[3px] h-[7px] bg-current opacity-60 animate-[pulse_0.5s_steps(2)_infinite_0.4s]"></div>
          <div className="w-[3px] h-[9px] bg-current opacity-40 animate-[pulse_2s_steps(2)_infinite_0.6s]"></div>
        </div>
        {/* WiFi Bars / Search animation */}
        <div className="relative w-4 h-3 overflow-hidden flex items-end group">
          <div className="w-full h-[2px] bg-current opacity-30 animate-[scan_3s_linear_infinite]"></div>
          <div className="absolute bottom-0 left-0 w-full h-full border-t border-current opacity-40"></div>
        </div>
        {/* Battery with cycling charge/drain */}
        <div className="w-6 h-3 border border-current relative flex items-center p-[1px] opacity-80">
          <div className="h-full bg-current animate-[battery-cycle_10s_linear_infinite]"></div>
          <div className="absolute -right-[2px] w-[2px] h-1.5 bg-current"></div>
        </div>
      </div>
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0); }
        }
        @keyframes battery-cycle {
          0% { width: 100%; }
          45% { width: 0%; }
          55% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default StatusBar;
