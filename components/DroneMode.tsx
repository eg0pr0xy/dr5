import React, { useState, useEffect, useRef } from 'react';

interface DroneModeProps {
  audioContext: AudioContext;
  isAnimated?: boolean;
  embedded?: boolean;
  isMobile?: boolean;
}

const DroneMode: React.FC<DroneModeProps> = ({ audioContext, isAnimated, embedded, isMobile = false }) => {
  const [visData, setVisData] = useState<number[]>(new Array(6).fill(0));
  const [noiseVisData, setNoiseVisData] = useState(0);
  const [cutoff, setCutoff] = useState(400);
  const [resonance, setResonance] = useState(4.0);
  const [signalStrength, setSignalStrength] = useState(0);
  const [driftLevel, setDriftLevel] = useState(1); 
  const [lastStepType, setLastStepType] = useState<string>("IDLE");
  const [flickerFrame, setFlickerFrame] = useState(0);

  const [fmActive, setFmActive] = useState(false);
  const [subActive, setSubActive] = useState(true);

  // Space Invaders Game State
  const [invaders, setInvaders] = useState(() => {
    const formation = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 10; col++) {
        formation.push({
          id: `${row}-${col}`,
          x: col,
          y: row,
          type: row === 0 ? 'advanced' : row < 3 ? 'standard' : 'basic',
          alive: true
        });
      }
    }
    return formation;
  });

  const [playerShip, setPlayerShip] = useState({ x: 5, y: 7 });
  const [bullets, setBullets] = useState([]);
  const [invaderBullets, setInvaderBullets] = useState([]);
  const [gameState, setGameState] = useState('playing'); // 'playing', 'won', 'lost'
  const [formationDirection, setFormationDirection] = useState(1); // 1 = right, -1 = left
  const [formationStep, setFormationStep] = useState(0);
  const [descentCount, setDescentCount] = useState(0);
  const [explosions, setExplosions] = useState([]);
  const [score, setScore] = useState(0);

  // Space Invaders Game Logic
  useEffect(() => {
    const gameInterval = setInterval(() => {
      if (gameState !== 'playing') return;

      // Move invaders (endless gameplay - no lose condition)
      setInvaders(prev => {
        const aliveInvaders = prev.filter(inv => inv.alive);
        if (aliveInvaders.length === 0) {
          // Auto-reset formation when all invaders destroyed
          setTimeout(() => {
            setInvaders(() => {
              const formation = [];
              for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 10; col++) {
                  formation.push({
                    id: `${row}-${col}-${Date.now()}`, // Unique ID for new formation
                    x: col,
                    y: row,
                    type: row === 0 ? 'advanced' : row < 3 ? 'standard' : 'basic',
                    alive: true
                  });
                }
              }
              return formation;
            });
          }, 1000); // Brief pause before new formation
          return prev;
        }

        return prev.map(invader => {
          if (!invader.alive) return invader;

          let newX = invader.x + formationDirection * 0.5;
          let newY = invader.y;

          // Check horizontal boundaries and descend
          if (newX >= 9.5 || newX <= -0.5) {
            setFormationDirection(-formationDirection);
            newY += 1; // Descend one row
          }

          // Wrap invaders back to top when they reach bottom (endless gameplay)
          if (newY >= 7) {
            newY = 0; // Reset to top
            newX = Math.floor(Math.random() * 10); // Random horizontal position
          }

          return {
            ...invader,
            x: Math.max(0, Math.min(9, newX)),
            y: newY
          };
        });
      });

      // Invader shooting (random)
      if (Math.random() < 0.01) {
        const aliveInvaders = invaders.filter(inv => inv.alive);
        if (aliveInvaders.length > 0) {
          const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
          setInvaderBullets(prev => [...prev, { x: shooter.x, y: shooter.y, id: Date.now() }]);
        }
      }

      // Move bullets
      setBullets(prev => prev.map(bullet => ({ ...bullet, y: bullet.y - 0.8 })).filter(bullet => bullet.y > -1));
      setInvaderBullets(prev => prev.map(bullet => ({ ...bullet, y: bullet.y + 0.4 })).filter(bullet => bullet.y < 9));

      // Collision detection
      setBullets(prevBullets => {
        return prevBullets.filter(bullet => {
          const hitInvader = invaders.find(invader =>
            invader.alive &&
            Math.abs(invader.x - bullet.x) < 0.6 &&
            Math.abs(invader.y - bullet.y) < 0.6
          );

          if (hitInvader) {
            // Create explosion
            setExplosions(prev => [...prev, { x: hitInvader.x, y: hitInvader.y, frame: 0 }]);

            // Remove invader
            setInvaders(prev => prev.map(inv =>
              inv.id === hitInvader.id ? { ...inv, alive: false } : inv
            ));

            // Award points based on invader type
            const points = hitInvader.type === 'advanced' ? 30 : hitInvader.type === 'standard' ? 20 : 10;
            setScore(prev => prev + points);

            return false; // Remove bullet
          }
          return true; // Keep bullet
        });
      });

      // No player hit logic - endless gameplay, player is immortal

      // Update explosions
      setExplosions(prev => prev.map(exp => ({ ...exp, frame: exp.frame + 1 })).filter(exp => exp.frame < 6));

    }, 100); // Game update rate

    return () => clearInterval(gameInterval);
  }, [invaders, formationDirection, gameState, playerShip]);

  // Player auto-shooting
  useEffect(() => {
    if (gameState !== 'playing') return;

    const shootInterval = setInterval(() => {
      setBullets(prev => [...prev, { x: playerShip.x, y: playerShip.y, id: Date.now() }]);
    }, 800); // Shoot every 800ms

    return () => clearInterval(shootInterval);
  }, [gameState, playerShip]);

  // Reset game
  const resetGame = () => {
    setInvaders(() => {
      const formation = [];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 10; col++) {
          formation.push({
            id: `${row}-${col}`,
            x: col,
            y: row,
            type: row === 0 ? 'advanced' : row < 3 ? 'standard' : 'basic',
            alive: true
          });
        }
      }
      return formation;
    });
    setBullets([]);
    setInvaderBullets([]);
    setExplosions([]);
    setGameState('playing');
    setFormationDirection(1);
    setDescentCount(0);
    setScore(0);
  };

  const engineRef = useRef<{
    oscillators: OscillatorNode[];
    gains: GainNode[];
    filter: BiquadFilterNode;
    noise: AudioBufferSourceNode;
    analysers: AnalyserNode[];
    noiseAnalyser: AnalyserNode;
    pitchLfos: OscillatorNode[];
    fmOsc: OscillatorNode | null;
    fmGain: GainNode | null;
    subOsc: OscillatorNode | null;
    subGain: GainNode | null;
  } | null>(null);
  const analyserBuffersRef = useRef<Uint8Array<ArrayBuffer>[]>([]);
  const noiseBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Buffer pooling to reduce GC pressure
  const getAnalyserBuffer = (index: number, fftSize: number) => {
    if (!analyserBuffersRef.current[index]) {
      analyserBuffersRef.current[index] = new Uint8Array(fftSize);
    }
    return analyserBuffersRef.current[index];
  };

  const getNoiseBuffer = () => {
    if (!noiseBufferRef.current) {
      noiseBufferRef.current = new Uint8Array(256);
    }
    return noiseBufferRef.current;
  };

  const lastStepTimeRef = useRef<number>(0);
  const stepDurationRef = useRef<number>(1.0);

  const CHAR_SETS = [
    ["·", "░", "▒", "▓", "█"],
    ["·", "o", "0", "O", "@"],
    ["·", "-", "=", "+", "#"],
    ["·", "i", "l", "I", "H"],
    ["·", ".", ":", ";", "!"],
    ["·", "'", "^", "*", "†"],
    ["·", "░", "▒", "▓", "█"]
  ];

  // Step-based visual + control loop with enhanced animation
  const stepLoop = () => {
    if (!engineRef.current || !noiseBufferRef.current || analyserBuffersRef.current.length === 0) return;
    const time = audioContext.currentTime;
    setFlickerFrame(prev => (prev + 1) % 120);

    // Enhanced parameter stepping with visual feedback
    if (time - lastStepTimeRef.current > stepDurationRef.current) {
      lastStepTimeRef.current = time;
      stepDurationRef.current = 0.6 + Math.random() * 3.4;
      const chance = Math.random();

      if (chance > 0.5) {
        const targetCutoff = 100 + (Math.random() * 3 * 350);
        // Use linearRampToValueAtTime for smoother transitions
        engineRef.current.filter.frequency.cancelScheduledValues(time);
        engineRef.current.filter.frequency.setValueAtTime(engineRef.current.filter.frequency.value, time);
        engineRef.current.filter.frequency.linearRampToValueAtTime(targetCutoff, time + 0.5);
        setCutoff(Math.floor(targetCutoff));
        setLastStepType("FRQ_STEP");
      } else {
        const targetQ = [1, 4, 12, 25, 40][Math.floor(Math.random() * 5)];
        // Smoother Q transitions
        engineRef.current.filter.Q.cancelScheduledValues(time);
        engineRef.current.filter.Q.setValueAtTime(engineRef.current.filter.Q.value, time);
        engineRef.current.filter.Q.linearRampToValueAtTime(targetQ, time + 0.3);
        setResonance(targetQ);
        setLastStepType("RES_STEP");
      }
    }

    // Enhanced amplitude analysis with spectral centroid
    const getAmplitude = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
      analyser.getByteTimeDomainData(buf);
      let maxVal = 0;
      let sum = 0;
      let weightedSum = 0;

      for (let i = 0; i < buf.length; i++) {
        const val = Math.abs(buf[i] - 128);
        if (val > maxVal) maxVal = val;
        sum += val;
        weightedSum += val * i; // Weight by frequency bin
      }

      const centroid = sum > 0 ? weightedSum / sum : 0;
      return {
        amplitude: Math.floor((maxVal / 128) * 100),
        centroid: Math.floor((centroid / buf.length) * 100)
      };
    };

    const newData = engineRef.current.analysers.map((ana, i) => getAnalyserBuffer(i, ana.fftSize));
    const amplitudes = engineRef.current.analysers.map((ana, i) => getAmplitude(ana, newData[i]));
    const visAmplitudes = amplitudes.map(a => a.amplitude);

    setVisData(visAmplitudes);

    // Calculate spectral centroid across all harmonics
    const totalAmplitude = visAmplitudes.reduce((a, b) => a + b, 0);
    const weightedCentroid = amplitudes.reduce((sum, a, i) => sum + (a.centroid * visAmplitudes[i]), 0);
    const spectralCentroid = totalAmplitude > 0 ? weightedCentroid / totalAmplitude : 0;

    setNoiseVisData(getAmplitude(engineRef.current.noiseAnalyser, noiseBufferRef.current!).amplitude);
    setSignalStrength(Math.floor((totalAmplitude / 600) * 100 + (Math.random() * 5)));
  };

  useEffect(() => {
    if (audioContext.state === 'suspended') {
      try { audioContext.resume(); } catch {}
    }
    const mainGain = audioContext.createGain();
    mainGain.gain.setValueAtTime(0.4, audioContext.currentTime);
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioContext.currentTime);
    filter.Q.setValueAtTime(4, audioContext.currentTime);
    const baseFreqs = [55, 110, 82.5, 165, 110.5, 164.8];
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const analysers: AnalyserNode[] = [];
    const pitchLfos: OscillatorNode[] = [];

    const subOsc = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(27.5, audioContext.currentTime);
    subGain.gain.setValueAtTime(subActive ? 0.3 : 0, audioContext.currentTime);
    subOsc.connect(subGain);
    subGain.connect(filter);
    subOsc.start();

    baseFreqs.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      const pitchLfo = audioContext.createOscillator();
      const pitchLfoGain = audioContext.createGain();
      pitchLfo.frequency.setValueAtTime(0.01 + Math.random() * 0.05, audioContext.currentTime);
      pitchLfoGain.gain.setValueAtTime(2.5, audioContext.currentTime);
      pitchLfo.connect(pitchLfoGain);
      pitchLfoGain.connect(osc.frequency);
      pitchLfo.start();
      pitchLfos.push(pitchLfo);
      oscGain.gain.setValueAtTime(0.15, audioContext.currentTime);
      osc.connect(oscGain);
      oscGain.connect(analyser);
      analyser.connect(filter);
      osc.start();
      oscillators.push(osc);
      gains.push(oscGain);
      analysers.push(analyser);
      analyserBuffersRef.current[i] = new Uint8Array(analyser.fftSize);
    });
    noiseBufferRef.current = new Uint8Array(256);

    // FM modulator shared across carriers
    const fmOsc = audioContext.createOscillator();
    const fmGain = audioContext.createGain();
    fmOsc.type = 'sine';
    fmOsc.frequency.setValueAtTime(0.4, audioContext.currentTime);
    fmGain.gain.setValueAtTime(fmActive ? 18 : 0, audioContext.currentTime);
    fmOsc.connect(fmGain);
    gains.forEach((g, i) => {
      fmGain.connect(oscillators[i].frequency);
    });
    fmOsc.start();

    const bufferSize = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
    }
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.06, audioContext.currentTime);
    const noiseAnalyser = audioContext.createAnalyser();
    noiseAnalyser.fftSize = 256;
    noiseSource.connect(noiseGain);
    noiseGain.connect(noiseAnalyser);
    noiseAnalyser.connect(filter);
    noiseSource.start();
    filter.connect(mainGain);
    mainGain.connect(audioContext.destination);
    engineRef.current = { oscillators, gains, filter, noise: noiseSource, analysers, noiseAnalyser, pitchLfos, fmOsc, fmGain, subOsc, subGain };

    // Step loop only (no rAF) for stability
    const updateDelay = isMobile ? 200 : 160;
    const updateInterval = setInterval(stepLoop, updateDelay);

    return () => {
      clearInterval(updateInterval);
      if (engineRef.current) {
        engineRef.current.oscillators.forEach(o => o.stop());
        engineRef.current.noise.stop();
        engineRef.current.pitchLfos.forEach(l => l.stop());
        engineRef.current.subOsc?.stop();
        engineRef.current.fmOsc?.stop();
      }
      mainGain.disconnect();
    };
  }, [audioContext, fmActive, isMobile]);

  useEffect(() => {
    if (!engineRef.current) return;
    const time = audioContext.currentTime;
    engineRef.current.oscillators.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(55 * [1, 2, 1.5, 3, 2.01, 2.99][i] + ([0, 0.4, -0.6, 0.5, 0.8, -0.3][i] * driftLevel * 0.5), time, 1.2);
    });
  }, [driftLevel, audioContext]);

  useEffect(() => {
    if (!engineRef.current || !engineRef.current.fmGain) return;
    const time = audioContext.currentTime;
    engineRef.current.fmGain.gain.setTargetAtTime(fmActive ? 18 : 0, time, 1.0);
  }, [fmActive, audioContext]);

  useEffect(() => {
    if (!engineRef.current || !engineRef.current.subGain) return;
    const time = audioContext.currentTime;
    engineRef.current.subGain.gain.setTargetAtTime(subActive ? 0.32 : 0.0, time, 0.8);
  }, [subActive, audioContext]);

  const allSignals = [...visData, noiseVisData];
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  const [scan, setScan] = useState(0);
  useEffect(() => {
    // Slower scan on mobile to save battery
    const scanDelay = isMobile ? 150 : 90;
    const id = setInterval(() => setScan(v => (v + 2) % 100), scanDelay);
    return () => clearInterval(id);
  }, [isMobile]);

  return (
    <div className={`h-full flex flex-col ${embedded ? 'p-2' : 'p-6'} overflow-hidden font-mono ${motionClass}`}>
      {(!embedded) && (
      <header className="grid grid-cols-2 gap-4 shrink-0 mb-6 pb-4 border-b border-current border-opacity-10">
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            <span className={`w-2 h-2 bg-current ${driftLevel === 0 ? 'opacity-40' : 'animate-pulse'}`}></span>
            {driftLevel === 0 ? 'PHASE_SYNC' : 'DRIFT_MOD'}
          </div>
          <div className="text-[8px] opacity-40 uppercase tracking-[0.2em]">MOD: {lastStepType}</div>
        </div>
        <div className="text-[9px] opacity-60 tabular-nums text-right border-l border-current border-opacity-10 pl-4">
          <div className="flex justify-between"><span>VCO_FRQ:</span> <span>{cutoff}HZ</span></div>
          <div className="flex justify-between"><span>SQL_THR:</span> <span>{resonance.toFixed(1)}</span></div>
        </div>
      </header>
      )}

      <div className="flex-1 w-full h-full flex flex-col justify-center items-center relative">
        {/* Space Invaders Game Overlay */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Invaders */}
          {invaders.map(invader => {
            if (!invader.alive) return null;
            const invaderChar = invader.type === 'advanced' ? '{≈}' : invader.type === 'standard' ? '(◊)' : '[+]';
            return (
              <div
                key={invader.id}
                className="absolute text-current opacity-90"
                style={{
                  left: `${10 + invader.x * 8}%`,
                  top: `${15 + invader.y * 10}%`,
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                {invaderChar}
              </div>
            );
          })}

          {/* Player Ship */}
          <div
            className="absolute text-current font-bold"
            style={{
              left: `${10 + playerShip.x * 8}%`,
              top: `${15 + playerShip.y * 10}%`,
              fontSize: '14px'
            }}
          >
            [⯈]
          </div>

          {/* Player Bullets */}
          {bullets.map(bullet => (
            <div
              key={bullet.id}
              className="absolute text-current opacity-80"
              style={{
                left: `${10 + bullet.x * 8}%`,
                top: `${15 + bullet.y * 10}%`,
                fontSize: '8px'
              }}
            >
              |
            </div>
          ))}

          {/* Invader Bullets */}
          {invaderBullets.map(bullet => (
            <div
              key={bullet.id}
              className="absolute text-current opacity-60"
              style={{
                left: `${10 + bullet.x * 8}%`,
                top: `${15 + bullet.y * 10}%`,
                fontSize: '8px'
              }}
            >
              ↓
            </div>
          ))}

          {/* Explosions - monochrome */}
          {explosions.map(exp => (
            <div
              key={`exp-${exp.x}-${exp.y}`}
              className="absolute text-current font-bold animate-pulse"
              style={{
                left: `${10 + exp.x * 8}%`,
                top: `${15 + exp.y * 10}%`,
                fontSize: '14px'
              }}
            >
              {exp.frame === 0 ? '※' : exp.frame === 1 ? '*' : exp.frame === 2 ? '✱' : '·'}
            </div>
          ))}

          {/* Score Display - always visible in endless mode */}
          <div className="absolute top-4 right-4 text-current text-xs opacity-60">
            SCORE: {score}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-x-6 gap-y-1 relative z-10 p-4">
          {['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'N'].map((label, i) => (
            <div key={i} className={`text-[7px] opacity-30 text-center mb-3 font-bold border-b border-current ${motionClass}`}>{label}</div>
          ))}
          {Array.from({ length: 12 }).map((_, rowIndex) => {
            const invertedRowIndex = 11 - rowIndex;
            const threshold = (invertedRowIndex / 11) * 100;
            return allSignals.map((signalValue, colIndex) => {
              const isActive = signalValue >= threshold;
              const char = isActive ? CHAR_SETS[colIndex][Math.min(CHAR_SETS[colIndex].length-1, Math.floor((signalValue-threshold)/20))] : '·';
              return <div key={`${rowIndex}-${colIndex}`} className={`text-center text-xs w-4 h-4 flex items-center justify-center transition-all ${isActive ? 'opacity-100 font-bold' : 'opacity-[0.1]'} ${motionClass}`}>{char}</div>;
            });
          })}
        </div>
        {/* Scan line overlay */}
        <div className="absolute left-0 right-0" style={{ top: `${scan}%`, opacity: 0.12 }}>
          <div className="w-full h-[1px] bg-current"></div>
        </div>
      </div>

      {(!embedded) && (
      <footer className="mt-8 border-t border-current border-opacity-10 pt-6 flex justify-between items-center">
        <div className="flex gap-4">
          <span onClick={() => setDriftLevel(prev => (prev + 1) % 5)} className="text-[10px] cursor-pointer tabular-nums">[ DRIFT:{'|'.repeat(driftLevel)} ]</span>
          <span onClick={() => setFmActive(!fmActive)} className={`text-[10px] cursor-pointer ${fmActive ? 'underline' : 'opacity-40'}`}>[ FM ]</span>
          <span onClick={() => setSubActive(!subActive)} className={`text-[10px] cursor-pointer ${subActive ? 'underline' : 'opacity-40'}`}>[ SUB ]</span>
        </div>
        <div className="text-[9px] opacity-40 tracking-wider">{signalStrength}% SIGNAL</div>
      </footer>
      )}
    </div>
  );
};

export default DroneMode;
