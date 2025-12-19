
import React, { useState, useEffect, useRef } from 'react';

interface EnvironModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}

const EnvironMode: React.FC<EnvironModeProps> = ({ audioContext, isAnimated }) => {
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [density, setDensity] = useState(false);
  const [windActive, setWindActive] = useState(true);
  const [stats, setStats] = useState({ activeCells: 0, roomFlux: 0 });
  
  const energyFieldRef = useRef<number[][]>(
    Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => Math.random()))
  );

  const engineRef = useRef<{
    noise: AudioBufferSourceNode;
    noiseGain: GainNode;
    filters: BiquadFilterNode[];
    droneOscs: OscillatorNode[];
    droneGains: GainNode[];
    sub: OscillatorNode;
    subGain: GainNode;
    mainGain: GainNode;
    shaper: WaveShaperNode;
    compressor: DynamicsCompressorNode;
  } | null>(null);

  useEffect(() => {
    if (audioContext.state === 'suspended') audioContext.resume();
    const mainGain = audioContext.createGain();
    mainGain.gain.setValueAtTime(0.6, audioContext.currentTime);
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
    const shaper = audioContext.createWaveShaper();
    const curve = new Float32Array(44100);
    const drive = 100;
    for (let i = 0; i < 44100; ++i) {
      const x = i * 2 / 44100 - 1;
      curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.connect(compressor);
    compressor.connect(mainGain);
    mainGain.connect(audioContext.destination);

    const resonantFreqs = [73.42, 110, 146.83, 164.81, 220, 277.18, 329.63, 440, 554.37, 659.25, 880, 1108.73];
    const filters = resonantFreqs.map(freq => {
      const f = audioContext.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, audioContext.currentTime);
      f.Q.setValueAtTime(50, audioContext.currentTime); 
      return f;
    });

    const droneOscs: OscillatorNode[] = [];
    const droneGains: GainNode[] = [];
    resonantFreqs.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq / 2, audioContext.currentTime);
      g.gain.setValueAtTime(0, audioContext.currentTime);
      osc.connect(g);
      g.connect(filters[i]);
      filters[i].connect(shaper);
      osc.start();
      droneOscs.push(osc);
      droneGains.push(g);
    });

    const bufferSize = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.05 * white)) / 1.05; 
        lastOut = data[i];
    }
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.15, audioContext.currentTime);
    noise.connect(noiseGain);
    filters.forEach(f => noiseGain.connect(f));

    const sub = audioContext.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(32.7, audioContext.currentTime);
    const subGain = audioContext.createGain();
    subGain.gain.setValueAtTime(0.3, audioContext.currentTime);
    sub.connect(subGain);
    subGain.connect(shaper);
    noise.start();
    sub.start();

    engineRef.current = { noise, noiseGain, filters, droneOscs, droneGains, sub, subGain, mainGain, shaper, compressor };
    return () => { noise.stop(); sub.stop(); droneOscs.forEach(o => o.stop()); mainGain.disconnect(); };
  }, [audioContext]);

  useEffect(() => {
    const charSets = { high: ['█', '▓', '▒', '░', '8', 'X', '#', '@'], low: ['+', 'x', ':', '-', '=', '*', '†', '·'] };
    const updateMatrix = () => {
      const activeSet = density ? charSets.high : charSets.low;
      const threshold = density ? 0.35 : 0.75;
      let currentActiveCount = 0;
      let totalFlux = 0;
      const newEnergy = energyFieldRef.current.map(row => row.map(val => {
          const drift = (Math.random() - 0.5) * (density ? 0.4 : 0.15);
          totalFlux += Math.abs(drift);
          return Math.max(0, Math.min(1, val + drift));
      }));
      energyFieldRef.current = newEnergy;
      const columnDensities = new Array(12).fill(0);
      const newMatrix = newEnergy.map(row => row.map((energy, colIdx) => {
          if (energy > threshold) {
            currentActiveCount++;
            columnDensities[colIdx] += energy;
            const charIdx = Math.floor(((energy - threshold) / (1 - threshold)) * activeSet.length);
            return activeSet[Math.min(charIdx, activeSet.length - 1)];
          } else { return energy > (threshold - 0.1) ? '·' : ' '; }
      }));
      setMatrix(newMatrix);
      setStats({ activeCells: currentActiveCount, roomFlux: totalFlux / 144 });
      if (engineRef.current) {
        const time = audioContext.currentTime;
        const { droneGains, filters, subGain, noiseGain, mainGain, compressor } = engineRef.current;
        columnDensities.forEach((d, i) => {
          const normalized = d / 12; 
          droneGains[i].gain.setTargetAtTime(0.05 + (normalized * 0.25), time, 0.1);
          filters[i].Q.setTargetAtTime(5 + (normalized * 150), time, 0.1);
        });
        const globalDensity = currentActiveCount / 144;
        subGain.gain.setTargetAtTime(0.2 + (globalDensity * 0.5), time, 0.2);
        noiseGain.gain.setTargetAtTime((windActive ? 0.1 : 0.02) + (globalDensity * 0.3), time, 0.3);
        compressor.threshold.setTargetAtTime(-24 - (globalDensity * 20), time, 0.2);
        mainGain.gain.setTargetAtTime(0.4 + (globalDensity * 0.6), time, 0.1);
      }
    };
    const interval = setInterval(updateMatrix, 150); 
    return () => clearInterval(interval);
  }, [density, windActive, audioContext]);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-6 overflow-hidden ${motionClass}`}>
      <header className="text-[9px] opacity-40 uppercase tracking-widest mb-6 flex justify-between shrink-0">
        <div className={`flex flex-col gap-1 ${motionClass}`}>
          <span>FIELD_RES: {windActive ? 'CRITICAL' : 'NOMINAL'}</span>
          <span>DENSITY: {((stats.activeCells / 144) * 100).toFixed(1)}%</span>
        </div>
        <div className={`text-right ${motionClass}`}>
          <span>STATION: DR-5_ENVIRON</span>
          <span>FLUX: {stats.roomFlux.toFixed(4)}</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center relative">
        <div className="grid grid-rows-12 gap-1.5 text-[12px] leading-none select-none tabular-nums font-bold">
          {matrix.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((char, j) => {
                const isPlaceholder = char === ' ' || char === '·';
                return <span key={j} className={`w-4 h-4 flex items-center justify-center transition-all ${isPlaceholder ? 'opacity-5' : 'opacity-100'} ${motionClass}`}>{char}</span>;
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
        <div className="flex gap-6">
          <span onClick={() => setDensity(!density)} className={`text-[10px] cursor-pointer ${density ? 'underline font-bold' : 'opacity-40'}`}>[ OVERLOAD ]</span>
          <span onClick={() => setWindActive(!windActive)} className={`text-[10px] cursor-pointer ${windActive ? 'underline font-bold' : 'opacity-40'}`}>[ PRESSURE ]</span>
        </div>
        <div className={`text-[8px] opacity-20 tracking-[0.4em] uppercase animate-pulse ${motionClass}`}>SYSTEM_STABLE</div>
      </footer>
    </div>
  );
};

export default EnvironMode;
