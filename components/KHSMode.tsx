
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
  const [diag, setDiag] = useState<{ active: number; centroid: number; nextShift: number; momentId: number; fadePct: number; shapeF: number; shapeQ: number }>({ active: 0, centroid: 0, nextShift: 0, momentId: 0, fadePct: 0, shapeF: 0, shapeQ: 0 });
  const momentIdRef = useRef(0);
  const radioActiveRef = useRef(radioActive);

  const serialMatrix = useRef<number[][]>(
    Array.from({ length: 14 }, () => Array.from({ length: 14 }, () => Math.random() > 0.5 ? 1 : 0))
  );

  const engineRef = useRef<{
    partials: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; baseFreq: number; }[];
    radio: { element: HTMLAudioElement; filter: BiquadFilterNode; gain: GainNode; analyser: AnalyserNode; source: MediaElementAudioSourceNode | null; };
    spectralShaper: BiquadFilterNode[];
    staticNoise: { whiteGain: GainNode; pinkGain: GainNode; brownGain: GainNode; };
    mainGain: GainNode;
    micAnalyser: AnalyserNode;
    moment: { id: number; startAt: number; nextAt: number; fadeDur: number; targetGains: number[]; driftFreqs: number[]; shapeFreqs: number[]; shapeQs: number[] };
  } | null>(null);

  const RATIOS = [1, 1.0679, 1.125, 1.1892, 1.25, 1.3333, 1.4142, 1.4983, 1.618, 1.7818, 1.88, 2.0, 2.13, 2.25];
  const FREQ_LABELS = ["43", "78", "120", "280", "640", "1.2K", "2.8K", "5.4K", "8.2K", "10K", "12K", "14K", "15K", "16K"];

  useEffect(() => {
    if (audioContext.state === 'suspended') audioContext.resume();
    const mainGain = audioContext.createGain();
    mainGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    mainGain.connect(audioContext.destination);

    const roomModes = [110, 240, 800, 1400, 2800];
    const spectralShaper = roomModes.map(freq => {
      const f = audioContext.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq, audioContext.currentTime);
      f.Q.setValueAtTime(10, audioContext.currentTime);
      f.connect(mainGain);
      return f;
    });

    const partials = RATIOS.map((ratio) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const pan = audioContext.createStereoPanner();
      const f = 43.2 * ratio;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, audioContext.currentTime);
      gain.gain.setValueAtTime(0.008, audioContext.currentTime);
      osc.connect(gain);
      gain.connect(pan);
      spectralShaper.forEach(filter => pan.connect(filter));
      osc.start();
      return { osc, gain, pan, baseFreq: f };
    });

    const radioElement = new Audio("https://dradio-edge-209a-fra-lg-cdn.cast.addradio.de/dradio/dlf/live/mp3/128/stream.mp3");
    radioElement.crossOrigin = "anonymous"; radioElement.loop = true;
    const radioGain = audioContext.createGain();
    radioGain.gain.setValueAtTime(0.0, audioContext.currentTime);
    const radioFilter = audioContext.createBiquadFilter();
    radioFilter.type = 'bandpass';
    const radioAnalyser = audioContext.createAnalyser(); radioAnalyser.fftSize = 512;
    try {
      const source = audioContext.createMediaElementSource(radioElement);
      source.connect(radioAnalyser);
      radioAnalyser.connect(radioFilter);
      radioFilter.connect(radioGain);
      spectralShaper.forEach(filter => radioGain.connect(filter));
    } catch (e) {}

    const initialTargets = partials.map(p => p.gain.gain.value);
    engineRef.current = {
      partials,
      radio: { element: radioElement, filter: radioFilter, gain: radioGain, analyser: radioAnalyser, source: null },
      spectralShaper,
      staticNoise: { whiteGain: mainGain, pinkGain: mainGain, brownGain: mainGain },
      mainGain,
      micAnalyser: radioAnalyser,
      moment: { id: 0, startAt: audioContext.currentTime, nextAt: audioContext.currentTime + 90, fadeDur: 45, targetGains: initialTargets, driftFreqs: partials.map(p => p.baseFreq), shapeFreqs: spectralShaper.map(f => f.frequency.value), shapeQs: spectralShaper.map(f => f.Q.value) }
    };

    // Visual updates (lightweight)
    const visInterval = setInterval(() => {
      if (!engineRef.current) return;
      setSpectralDensity(engineRef.current.partials.map(p => p.gain.gain.value * 1000));
      setActivePermIndex(prev => (prev + 1) % 14);
    }, 400);

    // Long-form moment scheduler
    const newMoment = () => {
      if (!engineRef.current) return;
      const now = audioContext.currentTime;
      // next window
      const nextIn = 60 + Math.random() * 120; // 60–180s
      const fade = 30 + Math.random() * 60; // 30–90s
      const target = new Array(14).fill(0);
      const peaks = 1 + Math.floor(Math.random() * 3); // 1–3 peaks
      for (let k = 0; k < peaks; k++) {
        const center = Math.floor(Math.random() * 14);
        const sigma = 0.8 + Math.random() * 2.5;
        for (let i = 0; i < 14; i++) {
          const d = (i - center) / sigma;
          target[i] += Math.exp(-0.5 * d * d);
        }
      }
      // normalize
      const max = Math.max(0.0001, ...target);
      for (let i = 0; i < 14; i++) target[i] /= max;
      // set target gains (quiet base + shaped)
      const targetGains = target.map(v => 0.003 + v * 0.06);
      // schedule ramps
      // frequency drift factors per moment (±3%)
      const driftFreqs = engineRef.current.partials.map(p => p.baseFreq * (1 + (Math.random() * 0.06 - 0.03)));
      engineRef.current.partials.forEach((p, i) => {
        p.gain.gain.cancelScheduledValues(now);
        p.gain.gain.setValueAtTime(p.gain.gain.value, now);
        p.gain.gain.linearRampToValueAtTime(targetGains[i], now + fade);
        // slow pan drift per moment
        const panTarget = -0.6 + Math.random() * 1.2;
        p.pan.pan.cancelScheduledValues(now);
        p.pan.pan.setValueAtTime(p.pan.pan.value, now);
        p.pan.pan.linearRampToValueAtTime(panTarget, now + fade);
        // slow frequency drift to new target
        p.osc.frequency.cancelScheduledValues(now);
        p.osc.frequency.setValueAtTime(p.osc.frequency.value, now);
        p.osc.frequency.linearRampToValueAtTime(driftFreqs[i], now + fade);
      });
      // spectral shaper gentle retune per moment
      const shapeFreqs: number[] = [];
      const shapeQs: number[] = [];
      engineRef.current.spectralShaper.forEach((filt) => {
        const baseF = filt.frequency.value;
        const fTarget = Math.max(60, Math.min(12000, baseF * (0.9 + Math.random() * 0.2)));
        const qTarget = 8 + Math.random() * 6; // 8..14
        filt.frequency.cancelScheduledValues(now);
        filt.frequency.setValueAtTime(baseF, now);
        filt.frequency.linearRampToValueAtTime(fTarget, now + fade);
        filt.Q.cancelScheduledValues(now);
        filt.Q.setValueAtTime(filt.Q.value, now);
        filt.Q.linearRampToValueAtTime(qTarget, now + fade);
        shapeFreqs.push(fTarget);
        shapeQs.push(qTarget);
      });
      // radio bed slow fade according to radioActive state
      engineRef.current.radio.gain.cancelScheduledValues(now);
      engineRef.current.radio.gain.setValueAtTime(engineRef.current.radio.gain.gain.value, now);
      engineRef.current.radio.gain.linearRampToValueAtTime(radioActiveRef.current ? 0.15 : 0.0, now + fade);

      const id = ++momentIdRef.current;
      engineRef.current.moment = { id, startAt: now, nextAt: now + nextIn, fadeDur: fade, targetGains, driftFreqs, shapeFreqs, shapeQs };
    };

    newMoment();
    const momentIv = setInterval(() => {
      if (!engineRef.current) return;
      const t = audioContext.currentTime;
      if (t >= engineRef.current.moment.nextAt) newMoment();
      // diagnostics update (1 Hz)
      const gains = engineRef.current.moment.targetGains;
      const freqs = engineRef.current.moment.driftFreqs;
      const sumGain = gains.reduce((a, b) => a + b, 0) || 1;
      const centroid = gains.reduce((a, g, i) => a + g * freqs[i], 0) / sumGain;
      const active = gains.filter(g => g > 0.01).length;
      const nextShift = Math.max(0, Math.ceil(engineRef.current.moment.nextAt - t));
      const fadePct = Math.max(0, Math.min(100, Math.round(((t - engineRef.current.moment.startAt) / engineRef.current.moment.fadeDur) * 100)));
      const shapeF = engineRef.current.moment.shapeFreqs.reduce((a, b) => a + b, 0) / engineRef.current.moment.shapeFreqs.length;
      const shapeQ = engineRef.current.moment.shapeQs.reduce((a, b) => a + b, 0) / engineRef.current.moment.shapeQs.length;
      setDiag({ active, centroid, nextShift, momentId: engineRef.current.moment.id, fadePct, shapeF, shapeQ });
    }, 1000);

    return () => {
      clearInterval(visInterval);
      clearInterval(momentIv);
      partials.forEach(p => p.osc.stop());
      radioElement.pause();
      mainGain.disconnect();
    };
  }, [audioContext]);

  // Smoothly update radio bed on toggle without rebuilding graph
  useEffect(() => {
    radioActiveRef.current = radioActive;
    if (!engineRef.current) return;
    const t = audioContext.currentTime;
    const g = engineRef.current.radio.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.gain.value, t);
    g.linearRampToValueAtTime(radioActive ? 0.15 : 0.0, t + 1.0);
    // attempt play/pause on user toggle
    try {
      if (radioActive) {
        engineRef.current.radio.element.play();
      } else {
        engineRef.current.radio.element.pause();
      }
    } catch {}
  }, [radioActive, audioContext]);

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
      {/* ASCII diagnostics */}
      <div className={`text-[9px] opacity-60 uppercase tracking-[0.2em] mb-2 tabular-nums ${motionClass}`}>
        KHS_DIAG: [ MOM:{diag.momentId} ] [ FADE:{diag.fadePct}% ] [ PARTIALS:{diag.active} ] [ CENTROID:{Math.round(diag.centroid)}HZ ] [ BPF:{Math.round(diag.shapeF)}HZ/Q{diag.shapeQ.toFixed(1)} ] [ NEXT_SHIFT:{diag.nextShift}s ]
      </div>
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
