
import React, { useState, useEffect, useRef } from 'react';

interface Mushroom {
  x: number;
  y: number;
  type: number;
}

interface OracleModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}

const OracleMode: React.FC<OracleModeProps> = ({ audioContext, isAnimated }) => {
  const [hexagram, setHexagram] = useState<number[]>(new Array(6).fill(0));
  const [rms, setRms] = useState(0);
  const [oracleText, setOracleText] = useState("SILENCE_IS_SOUND");
  const [mushrooms, setMushrooms] = useState<Mushroom[]>([]);
  const [highSens, setHighSens] = useState(false);
  const [resMode, setResMode] = useState(true);
  const [fluxGrid, setFluxGrid] = useState<number[][]>(
    Array.from({ length: 10 }, () => Array.from({ length: 16 }, () => 0))
  );

  const engineRef = useRef<{ micStream: MediaStream | null; analyser: AnalyserNode; mainGain: GainNode; } | null>(null);

  const throwCoins = () => {
    setHexagram(Array.from({ length: 6 }, () => Math.random() > 0.5 ? 1 : 0));
    setOracleText(["WAITING_FOR_EVENT", "NON_INTENTIONALITY", "CHANCE_DETERMINANT", "NOTHING_TO_SAY"][Math.floor(Math.random()*4)]);
  };

  useEffect(() => {
    let micStream: MediaStream | null = null;
    const mainGain = audioContext.createGain(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
    const setupMic = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = audioContext.createMediaStreamSource(micStream);
        const preAmp = audioContext.createGain(); preAmp.gain.setValueAtTime(highSens ? 30 : 15, audioContext.currentTime);
        micSource.connect(preAmp); preAmp.connect(analyser); analyser.connect(mainGain); mainGain.connect(audioContext.destination);
        engineRef.current = { micStream, analyser, mainGain };
      } catch (err) { setOracleText("MIC_ERROR"); }
    };
    setupMic();
    const intensityChars = ['.', ':', '*', '#'];
    const update = setInterval(() => {
      if (!engineRef.current) return;
      const data = new Uint8Array(engineRef.current.analyser.frequencyBinCount);
      engineRef.current.analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const norm = Math.min(1, avg / 255);
      setRms(avg);
      // flux grid: shift up, append new row driven by mic level
      setFluxGrid(prev => {
        const nextRow = prev[0].map((_, idx) => {
          const bandWeight = data[idx % data.length] / 255;
          const val = Math.min(3, Math.floor((norm * 3.5) + (bandWeight * (resMode ? 2 : 1)) + (Math.random() * 0.8)));
          return val;
        });
        const trimmed = prev.slice(1);
        trimmed.push(nextRow);
        return trimmed;
      });
      // spawn mushrooms on louder moments
      if (norm > (highSens ? 0.05 : 0.12) && Math.random() > 0.9) {
        setMushrooms(prev => [...prev.slice(-6), { x: Math.random()*80+10, y: Math.random()*80+10, type: Math.floor(Math.random()*2) }]);
      }
      // change oracle text on spikes
      if (norm > 0.4 && Math.random() > 0.9) throwCoins();
    }, 140);
    return () => { clearInterval(update); if (micStream) micStream.getTracks().forEach(t => t.stop()); mainGain.disconnect(); };
  }, [highSens]);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  const intensityChars = ['.', ':', '*', '#'];

  return (
    <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
      {mushrooms.map((m, i) => <div key={i} className={`absolute text-[10px] opacity-10 ${motionClass}`} style={{ left: `${m.x}%`, top: `${m.y}%` }}>{m.type === 0 ? "(_)" : "[_]"}</div>)}
      <header className="flex justify-between text-[9px] opacity-40 uppercase tracking-[0.4em] mb-12">
        <div className={motionClass}>ORACLE: {oracleText}</div>
        <div className={motionClass}>RMS: {rms.toFixed(1)}</div>
      </header>
      <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col items-center justify-center space-y-2 border border-current border-opacity-20 p-3">
          {hexagram.map((val, i) => (
            <div key={i} className={`flex gap-4 ${motionClass}`}>
              {val === 1 ? "-".repeat(16) : <>{'-'.repeat(7)} {'-'.repeat(7)}</>}
            </div>
          ))}
          <span onClick={throwCoins} className="mt-4 text-[10px] border border-current px-4 py-2 cursor-pointer hover:bg-transparent hover:text-current">[ THROW_COINS ]</span>
        </div>
        <div className="border border-current border-opacity-20 p-3">
          <div className="text-[9px] uppercase opacity-50 mb-2 tracking-[0.2em]">MICROPHONIC_FIELD</div>
          <div className="ascii-block text-[10px] leading-[1.1] whitespace-pre font-mono">
            {fluxGrid.map((row, rIdx) => (
              <div key={rIdx} className={motionClass}>
                {row.map((v, cIdx) => intensityChars[v] ?? '.').join('')}
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="mt-8 border-t border-current border-opacity-10 pt-6">
        <div className="flex gap-4">
          <span onClick={() => setHighSens(!highSens)} className={`text-[10px] cursor-pointer ${highSens ? 'underline' : 'opacity-40'}`}>[ HI_SENS ]</span>
          <span onClick={() => setResMode(!resMode)} className={`text-[10px] cursor-pointer ${resMode ? 'underline' : 'opacity-40'}`}>[ RESONANCE ]</span>
        </div>
      </footer>
    </div>
  );
};

export default OracleMode;
