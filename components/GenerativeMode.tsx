
import React, { useState, useEffect, useRef } from 'react';

interface GenerativeModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}

const GenerativeMode: React.FC<GenerativeModeProps> = ({ audioContext, isAnimated }) => {
  const [grid, setGrid] = useState<number[][]>([]);
  const [influence, setInfluence] = useState<boolean[]>(new Array(8).fill(false));
  const [rule30, setRule30] = useState(false);
  const [invert, setInvert] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [bandAmps, setBandAmps] = useState<number[]>(new Array(7).fill(0));
  const [flickerFrame, setFlickerFrame] = useState(0);
  
  const rows = 18; const cols = 14;
  const BAND_CHAR_SETS = [["·", "░", "▒", "▓", "█"], ["·", "o", "0", "O", "@"], ["·", "-", "=", "+", "#"], ["·", "i", "l", "I", "H"], ["·", ".", ":", ";", "!"], ["·", "'", "^", "*", "†"], ["·", "░", "▒", "▓", "█"]];

  const engineRef = useRef<{
    oscillators: OscillatorNode[]; gains: GainNode[]; analysers: AnalyserNode[]; filter: BiquadFilterNode; feedbackGain: GainNode; envOsc: OscillatorNode; envLfoFreq: OscillatorNode; envLfoAmp: OscillatorNode;
  } | null>(null);

  useEffect(() => {
    const mainGain = audioContext.createGain(); mainGain.gain.setValueAtTime(0.3, audioContext.currentTime);
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(1200, audioContext.currentTime);
    const feedbackGain = audioContext.createGain(); feedbackGain.gain.setValueAtTime(0, audioContext.currentTime);
    filter.connect(feedbackGain); feedbackGain.connect(filter); 
    const oscillators: OscillatorNode[] = []; const gains: GainNode[] = []; const analysers: AnalyserNode[] = [];
    [110, 220, 330, 440, 550, 660].forEach((f, i) => {
      const osc = audioContext.createOscillator(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 64;
      osc.type = i === 0 ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(f, audioContext.currentTime);
      const g = audioContext.createGain(); g.gain.setValueAtTime(0, audioContext.currentTime);
      const lfo = audioContext.createOscillator(); lfo.frequency.setValueAtTime(0.05 + (i * 0.02), audioContext.currentTime);
      const lfoGain = audioContext.createGain(); lfoGain.gain.setValueAtTime(0.04, audioContext.currentTime);
      lfo.connect(lfoGain); lfoGain.connect(g.gain); lfo.start();
      osc.connect(g); g.connect(analyser); analyser.connect(filter); osc.start();
      oscillators.push(osc); gains.push(g); analysers.push(analyser);
    });
    const envGain = audioContext.createGain(); envGain.gain.setValueAtTime(0.03, audioContext.currentTime); 
    const envOsc = audioContext.createOscillator(); envOsc.type = 'sine'; envOsc.frequency.setValueAtTime(38.89, audioContext.currentTime); 
    envOsc.connect(envGain); envGain.connect(mainGain); envOsc.start();
    filter.connect(mainGain); mainGain.connect(audioContext.destination);
    engineRef.current = { oscillators, gains, analysers, filter, feedbackGain, envOsc, envLfoFreq: envOsc, envLfoAmp: envGain };
    const visInterval = setInterval(() => {
      if (!engineRef.current) return;
      const newAmps = engineRef.current.analysers.map(ana => {
        const data = new Uint8Array(ana.frequencyBinCount); ana.getByteFrequencyData(data);
        return data.reduce((a, b) => a + b, 0) / data.length;
      });
      setBandAmps([...newAmps, newAmps.reduce((a, b) => a + b, 0) / newAmps.length]);
      setFlickerFrame(prev => (prev + 1) % 60);
    }, 50);
    return () => { clearInterval(visInterval); oscillators.forEach(o => o.stop()); envOsc.stop(); mainGain.disconnect(); };
  }, [audioContext]);

  useEffect(() => {
    const ruleSet = (rule30 ? 30 : 110).toString(2).padStart(8, '0').split('').reverse().map(Number);
    const interval = setInterval(() => {
      setGrid(prev => {
        const lastRow = prev.length ? prev[prev.length - 1] : new Array(cols).fill(0).map((_, i) => i === Math.floor(cols/2) ? 1 : 0);
        const nextRow = new Array(cols).fill(0);
        for (let c = 0; c < cols; c++) {
          const pattern = parseInt(`${lastRow[(c-1+cols)%cols]}${lastRow[c]}${lastRow[(c+1)%cols]}`, 2);
          nextRow[c] = invert ? (ruleSet[pattern] === 1 ? 0 : 1) : ruleSet[pattern];
          if (influence[Math.floor(c/2)] && Math.random() > 0.85) nextRow[c] = 1;
        }
        return prev.length >= rows ? [...prev.slice(1), nextRow] : [...prev, nextRow];
      });
    }, 150);
    return () => clearInterval(interval);
  }, [influence, rule30, invert]);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-6 overflow-hidden ${motionClass}`}>
      <header className="text-[9px] opacity-40 uppercase tracking-widest mb-6 flex justify-between shrink-0">
        <div className={`flex flex-col gap-1 ${motionClass}`}>
          <span>RECURSIVE_FIELD</span>
          <span>AMPS: {bandAmps.map(a => Math.floor(a)).join('|')}</span>
        </div>
        <div className={`text-right ${motionClass}`}><span>{rule30 ? 'RULE_30' : 'RULE_110'}</span></div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center font-mono leading-none tracking-tighter">
        <div className="grid grid-rows-18 gap-1.5 p-4 border border-current border-opacity-5">
          {grid.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((cell, j) => {
                const isActive = cell === 1; const amp = bandAmps[Math.floor(j/2)] || 0;
                const char = isActive ? BAND_CHAR_SETS[Math.floor(j/2)][Math.min(4, Math.floor(amp/10))] : '·';
                return <div key={j} className={`w-4 h-4 flex items-center justify-center text-[11px] ${isActive ? 'opacity-90 font-bold' : 'opacity-10'} ${motionClass}`}>{char}</div>;
              })}
            </div>
          ))}
        </div>
      </div>
      <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
        <div className="flex gap-4">
          <span onClick={() => setRule30(!rule30)} className={`text-[10px] cursor-pointer ${rule30 ? 'underline' : 'opacity-40'}`}>[ RULE ]</span>
          <span onClick={() => setInvert(!invert)} className={`text-[10px] cursor-pointer ${invert ? 'underline' : 'opacity-40'}`}>[ INVERT ]</span>
        </div>
        <div className={`text-[8px] opacity-20 tracking-[0.4em] uppercase ${motionClass}`}>GENERATIVE_AUTOMATA</div>
      </footer>
    </div>
  );
};

export default GenerativeMode;
