
import React, { useState, useEffect, useRef } from 'react';

interface MemoryFragment {
  x: number;
  y: number;
  content: string;
  opacity: number;
  life: number;
  isVibrating: boolean;
}

interface MemoryModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
}

const MemoryMode: React.FC<MemoryModeProps> = ({ audioContext, isAnimated }) => {
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);
  const [ambientRms, setAmbientRms] = useState(0);
  const [statusText, setStatusText] = useState("ROOM_IS_EMPTY");
  const [cutoff, setCutoff] = useState(800);
  const [q, setQ] = useState(5.0);
  const [currentStep, setCurrentStep] = useState(0);
  const [ghostsActive, setGhostsActive] = useState(true);
  const [pipsActive, setPipsActive] = useState(true);
  const [droneActive, setDroneActive] = useState(true);

  const engineRef = useRef<{
    micStream: MediaStream | null;
    processor: ScriptProcessorNode | null;
    buffer: Float32Array;
    bufferPtr: number;
    mainGain: GainNode;
    droneFilter: BiquadFilterNode;
    droneGain: GainNode;
    staticGain: GainNode;
    dustGain: GainNode;
  } | null>(null);

  const lastStepTimeRef = useRef<number>(0);
  const stepIndexRef = useRef<number>(0);
  const CAGE_FRAGMENTS = ["4'33\"", "SILENCE", "EVENT", "CHANCE", "ROOM", "EMPTY", "I_CHING", "MUSHROOM", "DECAY", "LISTEN"];
  const FREQ_STEPS = [400, 800, 1200, 300, 2000, 600, 1600, 100];
  const Q_STEPS = [2, 12, 5, 25, 4, 40, 8, 1];

  useEffect(() => {
    const bufferSize = audioContext.sampleRate * 2; 
    const memoryBuffer = new Float32Array(bufferSize);
    let ptr = 0;
    const mainGain = audioContext.createGain();
    mainGain.gain.setValueAtTime(0.5, audioContext.currentTime);
    mainGain.connect(audioContext.destination);
    const droneFilter = audioContext.createBiquadFilter();
    droneFilter.type = 'bandpass';
    const staticFilter = audioContext.createBiquadFilter();
    staticFilter.type = 'highpass';
    staticFilter.frequency.setValueAtTime(4500, audioContext.currentTime);
    const staticGain = audioContext.createGain();
    const dustGain = audioContext.createGain();
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer; noiseSource.loop = true;
    const dustSource = audioContext.createBufferSource();
    const dustBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate);
    const dustData = dustBuffer.getChannelData(0);
    for (let i = 0; i < dustData.length; i++) if (Math.random() > 0.9997) dustData[i] = (Math.random()*2-1)*0.4;
    dustSource.buffer = dustBuffer; dustSource.loop = true;
    const droneGain = audioContext.createGain();
    noiseSource.connect(droneFilter); droneFilter.connect(droneGain); droneGain.connect(mainGain);
    noiseSource.connect(staticFilter); staticFilter.connect(staticGain); staticGain.connect(mainGain);
    dustSource.connect(dustGain); dustGain.connect(mainGain);
    noiseSource.start(); dustSource.start();

    let micStream: MediaStream | null = null;
    let processor: ScriptProcessorNode | null = null;
    const startRecording = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(micStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < input.length; i++) { memoryBuffer[ptr] = input[i]; ptr = (ptr + 1) % bufferSize; }
          let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length); setAmbientRms(rms);
        };
        source.connect(processor); processor.connect(audioContext.destination); 
        engineRef.current = { micStream, processor, buffer: memoryBuffer, bufferPtr: ptr, mainGain, droneFilter, droneGain, staticGain, dustGain };
        const scheduleNextEvent = () => {
          if (!engineRef.current) return;
          const time = audioContext.currentTime;
          if (time - lastStepTimeRef.current > 1.5) {
            lastStepTimeRef.current = time;
            stepIndexRef.current = (stepIndexRef.current + 1) % FREQ_STEPS.length;
            engineRef.current.droneFilter.frequency.setTargetAtTime(FREQ_STEPS[stepIndexRef.current], time, 0.02);
            engineRef.current.droneFilter.Q.setTargetAtTime(Q_STEPS[stepIndexRef.current], time, 0.02);
            setCutoff(FREQ_STEPS[stepIndexRef.current]); setQ(Q_STEPS[stepIndexRef.current]); setCurrentStep(stepIndexRef.current);
          }
          setTimeout(scheduleNextEvent, 400 + Math.random() * 2000);
        };
        scheduleNextEvent();
      } catch (err) { setStatusText("ERR:MIC_MISSING"); }
    };
    startRecording();
    return () => {
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (processor) processor.disconnect();
      noiseSource.stop(); dustSource.stop(); mainGain.disconnect();
    };
  }, [audioContext, ghostsActive, pipsActive]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFragments(prev => {
        const decayed = prev.map(f => ({ ...f, life: f.life - 1, opacity: f.opacity * 0.94 })).filter(f => f.life > 0);
        if (Math.random() > 0.75) {
          decayed.push({ x: Math.floor(Math.random() * 80) + 10, y: Math.floor(Math.random() * 80) + 10, content: CAGE_FRAGMENTS[Math.floor(Math.random() * CAGE_FRAGMENTS.length)], opacity: 1, life: 8 + Math.random() * 12, isVibrating: false });
        }
        return decayed;
      });
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  return (
    <div className={`h-full flex flex-col p-8 overflow-hidden font-mono relative ${motionClass}`}>
      <header className="flex justify-between items-end text-[9px] opacity-40 mb-8 shrink-0 tracking-[0.3em]">
        <div className={`flex flex-col ${motionClass}`}>
          <span>MODE: PREPARED_ROOM</span>
          <span>STEP: [0{currentStep + 1}/08]</span>
        </div>
        <div className={`text-right ${motionClass}`}><span>FRAGMENTS: {fragments.length}</span></div>
      </header>
      <div className="flex-1 relative border border-current border-opacity-5 bg-black/5 overflow-hidden">
        {fragments.map((f, i) => (
          <div key={i} className={`absolute transition-all whitespace-nowrap ${motionClass}`} style={{ left: `${f.x}%`, top: `${f.y}%`, opacity: f.opacity, fontSize: '10px' }}>
            [ {f.content} ]
          </div>
        ))}
      </div>
      <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
        <div className="flex gap-4">
          <span onClick={() => setGhostsActive(!ghostsActive)} className={`text-[10px] cursor-pointer ${ghostsActive ? 'underline' : 'opacity-40'}`}>[ GHOSTS ]</span>
          <span onClick={() => setDroneActive(!droneActive)} className={`text-[10px] cursor-pointer ${droneActive ? 'underline' : 'opacity-40'}`}>[ STATIC ]</span>
        </div>
        <div className={`text-[9px] opacity-40 uppercase ${motionClass}`}>{statusText}</div>
      </footer>
    </div>
  );
};

export default MemoryMode;
