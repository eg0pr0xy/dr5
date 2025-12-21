import React, { useState, useEffect, useRef } from 'react';

interface Mushroom {
  x: number;
  y: number;
  type: number;
}

interface OracleModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
  isMobile?: boolean;
  onScore?: (points: number) => void;
}

const OracleMode: React.FC<OracleModeProps> = ({ audioContext, isAnimated, isMobile, onScore }) => {
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
    // True I-Ching hexagram generation using coin method
    // Each line: 3 coins (heads=3, tails=2), total determines line type
    // 6=broken changing, 7=unbroken, 8=broken, 9=unbroken changing
    const generateLine = (): number => {
      const coin1 = Math.random() > 0.5 ? 3 : 2; // heads=3, tails=2
      const coin2 = Math.random() > 0.5 ? 3 : 2;
      const coin3 = Math.random() > 0.5 ? 3 : 2;
      return coin1 + coin2 + coin3; // 6,7,8,9
    };

    const newHexagram = Array.from({ length: 6 }, () => generateLine());
    setHexagram(newHexagram);

    // Calculate hexagram number (simplified - would need full I-Ching table for meanings)
    const binaryValue = newHexagram.map(line => line === 7 || line === 9 ? 1 : 0).reverse().join('');
    const hexagramNumber = parseInt(binaryValue, 2) + 1; // 1-64

    setOracleText(`HEXAGRAM_${hexagramNumber}_GENERATED`);

    // Award points for coin throwing
    onScore?.(1); // 1 point per coin throw

    // Create organic audio gesture instead of cheesy click
    createOracleGesture(hexagramNumber);
  };

  const createOracleGesture = (hexagramNumber: number) => {
    if (!audioContext) return;

    const ctx = audioContext;
    const now = ctx.currentTime;

    // Create subtle, organic audio gesture based on hexagram
    // Use filtered noise with harmonic envelope - more Cage-inspired

    // Base frequency from hexagram number (create subtle harmonic relationship)
    const baseFreq = 110 + (hexagramNumber * 7) % 440; // Subtle variation

    // Create filtered noise burst - more organic than click
    const bufferSize = ctx.sampleRate * 0.3; // 300ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate filtered noise with subtle harmonic content
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const envelope = Math.max(0, 1 - (t / 0.3)); // 300ms decay
      const noise = (Math.random() * 2 - 1) * 0.3;

      // Add subtle harmonic content based on hexagram
      const harmonic = Math.sin(2 * Math.PI * baseFreq * t) * 0.2;
      const secondary = Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.1;

      data[i] = (noise + harmonic + secondary) * envelope * 0.15; // Very quiet, organic
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Apply gentle filtering to make it more organic
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(0.7, now);

    // Subtle stereo positioning based on hexagram
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((hexagramNumber % 3 - 1) * 0.3, now); // Slight left/right variation

    source.connect(filter);
    filter.connect(panner);
    panner.connect(ctx.destination);

    source.start(now);
  };

  useEffect(() => {
    let micStream: MediaStream | null = null;
    const mainGain = audioContext.createGain(); mainGain.gain.setValueAtTime(0, audioContext.currentTime);
    const analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
    const setupMic = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = audioContext.createMediaStreamSource(micStream);
        const preAmp = audioContext.createGain(); preAmp.gain.setValueAtTime(highSens ? 30 : 15, audioContext.currentTime);
        micSource.connect(preAmp); preAmp.connect(analyser);
        // Removed mic from speakers - analysis only
        // analyser.connect(mainGain);
        engineRef.current = { micStream, analyser, mainGain };
      } catch (err) { setOracleText("MIC_ERROR"); }
    };
    setupMic();
    const intensityChars = ['.', ':', '*', '#'];
    const updateDelay = isMobile ? 200 : 140;
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
    }, updateDelay);
    return () => { clearInterval(update); if (micStream) micStream.getTracks().forEach(t => t.stop()); mainGain.disconnect(); };
  }, [highSens, isMobile]);

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
            <div key={i} className={`text-center ${motionClass}`}>
              {val === 7 || val === 9 ? '─────────' : '───   ───'}
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
