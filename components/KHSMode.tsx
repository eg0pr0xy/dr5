
import React, { useState, useEffect, useRef } from 'react';

interface KHSModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}

const KHSMode: React.FC<KHSModeProps> = ({ audioContext, isAnimated }) => {
  const [spectralDensity, setSpectralDensity] = useState<number[]>(new Array(14).fill(0));
  const [activePermIndex, setActivePermIndex] = useState(0);
  const [entropyLevel, setEntropyLevel] = useState(0.2); 
  const [radioActive, setRadioActive] = useState(true);
  const [staticActive, setStaticActive] = useState(true);
  const [isSampling, setIsSampling] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [residueCount, setResidueCount] = useState(0);
  const [isFlickering, setIsFlickering] = useState(false);
  const [lockedPartials, setLockedPartials] = useState<boolean[]>(new Array(14).fill(false));
  const [radioTuning, setRadioTuning] = useState(0.5);
  const [ambientRms, setAmbientRms] = useState(0);

  const serialMatrix = useRef<number[][]>(
    Array.from({ length: 14 }, () => Array.from({ length: 14 }, () => Math.random() > 0.5 ? 1 : 0))
  );

  const engineRef = useRef<{
    partials: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; baseFreq: number; }[];
    radio: { element: HTMLAudioElement; filter: BiquadFilterNode; gain: GainNode; analyser: AnalyserNode; source: MediaElementAudioSourceNode | null; };
    sampler: { buffer: Float32Array; ptr: number; gain: GainNode; filter: BiquadFilterNode; distortion: WaveShaperNode; };
    spectralShaper: BiquadFilterNode[]; staticNoise: { whiteGain: GainNode; pinkGain: GainNode; brownGain: GainNode; }; mainGain: GainNode; micAnalyser: AnalyserNode;
  } | null>(null);

  const RATIOS = [1, 1.0679, 1.125, 1.1892, 1.25, 1.3333, 1.4142, 1.4983, 1.618, 1.7818, 1.88, 2.0, 2.13, 2.25];
  const FREQ_LABELS = ["43", "78", "120", "280", "640", "1.2K", "2.8K", "5.4K", "8.2K", "10K", "12K", "14K", "15K", "16K"];

  useEffect(() => {
    if (audioContext.state === 'suspended') audioContext.resume();
    const mainGain = audioContext.createGain(); mainGain.gain.setValueAtTime(0.5, audioContext.currentTime); mainGain.connect(audioContext.destination);
    const roomModes = [110, 240, 800, 1400, 2800];
    const spectralShaper = roomModes.map(freq => {
      const f = audioContext.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, audioContext.currentTime); f.Q.setValueAtTime(10, audioContext.currentTime); f.connect(mainGain); return f;
    });
    const partials = RATIOS.map((ratio) => {
      const osc = audioContext.createOscillator(); const gain = audioContext.createGain(); const pan = audioContext.createStereoPanner();
      osc.type = 'sine'; osc.frequency.setValueAtTime(43.2 * ratio, audioContext.currentTime); gain.gain.setValueAtTime(0.01, audioContext.currentTime);
      osc.connect(gain); gain.connect(pan); spectralShaper.forEach(filter => pan.connect(filter)); osc.start();
      return { osc, gain, pan, baseFreq: 43.2 * ratio };
    });
    const radioElement = new Audio("https://dradio-edge-209a-fra-lg-cdn.cast.addradio.de/dradio/dlf/live/mp3/128/stream.mp3");
    radioElement.crossOrigin = "anonymous"; radioElement.loop = true;
    const radioGain = audioContext.createGain(); const radioFilter = audioContext.createBiquadFilter(); radioFilter.type = 'bandpass';
    const radioAnalyser = audioContext.createAnalyser(); radioAnalyser.fftSize = 512;
    try {
      const source = audioContext.createMediaElementSource(radioElement); source.connect(radioAnalyser); radioAnalyser.connect(radioFilter); radioFilter.connect(radioGain); spectralShaper.forEach(filter => radioGain.connect(filter));
    } catch (e) {}
    engineRef.current = { partials, radio: { element: radioElement, filter: radioFilter, gain: radioGain, analyser: radioAnalyser, source: null }, sampler: { buffer: new Float32Array(0), ptr: 0, gain: mainGain, filter: radioFilter, distortion: mainGain as any }, spectralShaper, staticNoise: { whiteGain: mainGain, pinkGain: mainGain, brownGain: mainGain }, mainGain, micAnalyser: radioAnalyser };
    const visInterval = setInterval(() => {
      if (!engineRef.current) return;
      setSpectralDensity(engineRef.current.partials.map(p => p.gain.gain.value * 1000));
      setActivePermIndex(prev => (prev + 1) % 14);
    }, 200);
    return () => { clearInterval(visInterval); partials.forEach(p => p.osc.stop()); radioElement.pause(); mainGain.disconnect(); };
  }, [audioContext]);

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
      <div className={`flex-1 border border-current border-opacity-10 bg-black/5 flex flex-col p-2 ${motionClass}`}>
        <div className="flex-1 grid grid-cols-14 gap-1 opacity-60">
          {serialMatrix.current.map((row, rIdx) => row.map((val, cIdx) => <div key={`${rIdx}-${cIdx}`} className={`h-full transition-all ${val === 1 ? 'bg-current' : 'border border-current opacity-5'} ${rIdx === activePermIndex ? 'opacity-100' : 'opacity-10'} ${motionClass}`} />))}
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
