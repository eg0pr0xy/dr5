
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
    const update = setInterval(() => {
      if (!engineRef.current) return;
      const data = new Uint8Array(engineRef.current.analyser.frequencyBinCount);
      engineRef.current.analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setRms(avg);
      if (avg > (highSens ? 10 : 25) && Math.random() > 0.95) setMushrooms(prev => [...prev.slice(-4), { x: Math.random()*80+10, y: Math.random()*80+10, type: Math.floor(Math.random()*2) }]);
    }, 100);
    return () => { clearInterval(update); if (micStream) micStream.getTracks().forEach(t => t.stop()); mainGain.disconnect(); };
  }, [highSens]);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
      {mushrooms.map((m, i) => <div key={i} className={`absolute text-[10px] opacity-10 ${motionClass}`} style={{ left: `${m.x}%`, top: `${m.y}%` }}>{m.type === 0 ? "(_)" : "[_]"}</div>)}
      <header className="flex justify-between text-[9px] opacity-40 uppercase tracking-[0.4em] mb-12">
        <div className={motionClass}>ORACLE: {oracleText}</div>
        <div className={motionClass}>RMS: {rms.toFixed(1)}</div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        {hexagram.map((val, i) => (
          <div key={i} className={`flex gap-4 ${motionClass}`}>
            {val === 1 ? "-".repeat(16) : <>{'-'.repeat(7)} {'-'.repeat(7)}</>}
          </div>
        ))}
        <span onClick={throwCoins} className="mt-8 text-[10px] border border-current border-opacity-20 px-4 py-2 cursor-pointer hover:bg-current hover:text-black">[ THROW_COINS ]</span>
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
