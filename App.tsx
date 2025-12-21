import React, { useState, useEffect, useRef } from 'react';
import { Mode, Theme } from './types';
import StatusBar from './components/StatusBar';
import DroneMode from './components/DroneMode';
import EnvironMode from './components/EnvironMode';
import MemoryMode from './components/MemoryMode';
import GenerativeMode from './components/GenerativeMode';
import OracleMode from './components/OracleMode';
import KHSMode from './components/KHSMode';

import Panel from './components/Panel';
import DevResponsiveTester from './components/DevResponsiveTester';
import InfoPage from './components/InfoPage';

const BOOT_LOGS = [
  "> INIT INSTRUMENT_DR5_BIOS...",
  "> CHECKING MEMORY_BANKS... OK",
  "> MOUNTING VIRTUAL_CORES [L0..L5]...",
  "> CALIBRATING NOISE_FLOOR...",
  "> ESTABLISHING SIGNAL_CARRIER...",
  "> SYNCING GRID_COORD_A49...",
  "> LOADING WAVE_TABLES...",
  "> SYSTEM_READY."
];

const RILKE_FRAGMENTS = [
  "LOCKED_IN_THE_OPEN",
  "EVERY_ANGEL_IS_TERRIFYING",
  "YOU_MUST_CHANGE_YOUR_LIFE",
  "BEAUTY_BEGINNING_OF_TERROR",
  "SPACE_THAT_WE_ARE",
  "DWELL_IN_THE_OPEN",
  "THE_BREATH_OF_STATUES",
  "A_GOD_CAN_DO_IT"
];

interface Accident {
  x: number;
  y: number;
  char: string;
  life: number;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>(Mode.DRONE);
  const [displayMode, setDisplayMode] = useState<Mode>(Mode.DRONE);
  const [isFlipping, setIsFlipping] = useState(false);
  const [theme, setTheme] = useState<Theme>(Theme.DARK);
  const [contrast, setContrast] = useState(3);
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootLogs, setBootLogs] = useState<string[]>([]);
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isAnimatedUI, setIsAnimatedUI] = useState(true);
  const [isInverted, setIsInverted] = useState(false);
  const [customColors, setCustomColors] = useState({ bg: '#0A0A0A', text: '#E5D9C4' });
  const [rilkeIndex, setRilkeIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [infoFlipped, setInfoFlipped] = useState(false);
  const [showResp, setShowResp] = useState(false);
  const [lastColorSwitch, setLastColorSwitch] = useState(0);
  const [micPermissionStatus, setMicPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'requesting'>('unknown');

  // Gamification: Cryptic scoring system
  const [score, setScore] = useState(() => {
    const saved = localStorage.getItem('dr5_score');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Persist score to localStorage
  useEffect(() => {
    localStorage.setItem('dr5_score', score.toString());
  }, [score]);

  // Scoring function with sound effects
  const addScore = (points: number, context: string = 'interaction') => {
    setScore(prev => prev + points);

    // Play scoring sound effect
    if (audioContextRef.current && isAudioStarted) {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Different tones for different point values
      const baseFreq = 440 + (points * 110); // Higher points = higher pitch
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  };

  // Cryptic score display (hex format)
  const getCrypticScore = () => {
    return `SCORE: 0x${score.toString(16).toUpperCase().padStart(3, '0')}`;
  };
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastInteractRef = useRef<number>(Date.now());

  // UNIFIED AUDIO ARCHITECTURE
  const masterBusRef = useRef<{
    limiter: DynamicsCompressorNode;
    analyser: AnalyserNode;
    presenceMonitor: {
      rms: number;
      modeStatus: 'ACTIVE' | 'SILENT' | 'FALLBACK';
      lastCheck: number;
    };
  } | null>(null);

  // Audio diagnostics
  const [audioState, setAudioState] = useState<string>('suspended');
  const [resumeCount, setResumeCount] = useState(0);
  const [resumeFailCount, setResumeFailCount] = useState(0);
  const [lastResumeReason, setLastResumeReason] = useState<string>('NONE');
  const [lastResumeAt, setLastResumeAt] = useState<number | null>(null);
  const [pageVisibility, setPageVisibility] = useState<'visible' | 'hidden'>(
    (typeof document !== 'undefined' ? (document.visibilityState as any) : 'visible')
  );
  const [tick, setTick] = useState(0);
  const tickRateRef = useRef({ count: 0, last: performance.now(), hz: 0 });
  const [debugOverlay, setDebugOverlay] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelOverflow, setPanelOverflow] = useState(false);

  // Audio presence diagnostics
  const [audioPresence, setAudioPresence] = useState({ rms: -60, modeStatus: 'ACTIVE' as 'ACTIVE' | 'SILENT' | 'FALLBACK' });

  // Mobile detection and reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile and reduced motion preferences
  useEffect(() => {
    const checkMobileAndMotion = () => {
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setIsMobile(mobile);
      setPrefersReducedMotion(reducedMotion);
      
      // Auto-disable animations on mobile if reduced motion is preferred
      if (mobile && reducedMotion && isAnimatedUI) {
        setIsAnimatedUI(false);
      }
    };

    checkMobileAndMotion();
    window.addEventListener('resize', checkMobileAndMotion);
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionQuery.addListener(checkMobileAndMotion);
    
    return () => {
      window.removeEventListener('resize', checkMobileAndMotion);
      motionQuery.removeListener(checkMobileAndMotion);
    };
  }, [isAnimatedUI]);

  const getContrastOpacity = () => {
    switch(contrast) {
      case 1: return 'opacity-[0.5]';
      case 2: return 'opacity-[0.7]';
      case 3: return 'opacity-[0.85]';
      case 4: return 'opacity-100';
      default: return 'opacity-100';
    }
  };

  const getThemeStyles = () => {
    if (theme === Theme.CUSTOM) {
      return { bg: customColors.bg, text: customColors.text, border: customColors.text, grid: `${customColors.text}14` };
    }
    return theme === Theme.DARK 
      ? { bg: '#0A0A0A', text: '#E5D9C4', border: '#E5D9C4', grid: 'rgba(229, 217, 196, 0.08)' }
      : { bg: '#E5D9C4', text: '#1A1A1A', border: '#1A1A1A', grid: 'rgba(26, 26, 26, 0.08)' };
  };

  const colors = getThemeStyles();

  const generateRandomTheme = () => {
    const r = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    const bg = `#${r()}${r()}${r()}`;
    const getContrastingText = (hex: string) => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      // sRGB to linear
      const srgbToLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      const rl = srgbToLinear(r);
      const gl = srgbToLinear(g);
      const bl = srgbToLinear(b);
      const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      // Choose high-contrast text color (light parchment for dark bg, near-black for light bg)
      return luminance < 0.5 ? '#E5D9C4' : '#1A1A1A';
    };
    const text = getContrastingText(bg);
    setCustomColors({ bg, text });
    setTheme(Theme.CUSTOM);
  };

  const openInfo = () => {
    setShowInfo(true);
    setTimeout(() => setInfoFlipped(true), 50);
  };
  const closeInfo = () => {
    setInfoFlipped(false);
    setTimeout(() => setShowInfo(false), 300);
  };

  const resetToDefault = () => {
    setTheme(Theme.DARK);
    setIsInverted(false);
  };

  const ensureResumed = async (reason: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    setLastResumeReason(reason);
    try {
      if ((ctx as any).state !== 'running') {
        await ctx.resume();
        setResumeCount(c => c + 1);
        setLastResumeAt(Date.now());
      }
      setAudioState((ctx as any).state || 'unknown');
    } catch (e) {
      setResumeFailCount(c => c + 1);
    }
  };

  const initializeAudio = async () => {
    try {
      // STEP 1: REQUEST MICROPHONE ACCESS FIRST (for mobile compatibility)
      setMicPermissionStatus('requesting');

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        setMicPermissionStatus('granted');
        console.log('Microphone access granted');
      } catch (micError) {
        setMicPermissionStatus('denied');
        console.warn('Microphone access denied or unavailable:', micError);
        // Continue with audio initialization even if mic is denied
        // Memory/ORACLE modes will use fallback audio
      }

      // STEP 2: Create AudioContext if needed
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();

        // Track state changes
        audioContextRef.current.onstatechange = () => {
          setAudioState((audioContextRef.current as any)?.state || 'unknown');
        };
      }

      const ctx = audioContextRef.current;

      // STEP 3: Handle mobile-specific audio initialization
      if (isMobile) {
        console.log('Mobile audio initialization starting...');

        // On mobile, AudioContext starts suspended - resume it
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
            console.log('AudioContext resumed on mobile, state:', ctx.state);
          } catch (error) {
            console.warn('Failed to resume AudioContext on mobile:', error);
          }
        }

        // Multiple unlock attempts for stubborn mobile browsers
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // Create a silent audio graph to "unlock" mobile audio
            const unlockBuffer = ctx.createBuffer(1, 1, 22050);
            const unlockSource = ctx.createBufferSource();
            unlockSource.buffer = unlockBuffer;
            unlockSource.connect(ctx.destination);
            unlockSource.start(ctx.currentTime);
            unlockSource.stop(ctx.currentTime + 0.01);

            // Also try an oscillator unlock
            const unlockOsc = ctx.createOscillator();
            const unlockGain = ctx.createGain();
            unlockOsc.frequency.setValueAtTime(1, ctx.currentTime);
            unlockGain.gain.setValueAtTime(0, ctx.currentTime);
            unlockOsc.connect(unlockGain);
            unlockGain.connect(ctx.destination);
            unlockOsc.start(ctx.currentTime);
            unlockOsc.stop(ctx.currentTime + 0.01);

            console.log(`Mobile audio unlock attempt ${attempt + 1} completed`);
            break; // If successful, break out of retry loop
          } catch (error) {
            console.warn(`Mobile audio unlock attempt ${attempt + 1} failed:`, error);
            if (attempt === 2) {
              console.error('All mobile audio unlock attempts failed');
            }
          }
        }

        // Wait a bit for unlock to take effect
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Mobile audio initialization complete, context state:', ctx.state);
      }

      // STEP 4: Attempt to resume AudioContext
      await ensureResumed('ENTER_THE_ROOM');

      // Wait a bit for resume to take effect
      await new Promise(resolve => setTimeout(resolve, 100));

      // Additional unlock pulse for stubborn mobile browsers
      try {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.connect(ctx.destination);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(1, ctx.currentTime);
        o.connect(g);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.05);
        console.log('Audio unlock pulse sent, context state:', ctx.state);
      } catch (error) {
        console.warn('Audio unlock pulse failed:', error);
      }

      // Final check that AudioContext is running
      if (ctx.state !== 'running') {
        console.warn('AudioContext still not running after unlock attempts, state:', ctx.state);
        // Try one more resume attempt
        try {
          await ctx.resume();
          console.log('Final resume attempt, context state:', ctx.state);
        } catch (finalError) {
          console.error('Final resume attempt failed:', finalError);
        }
      }

      // STEP 5: CREATE UNIFIED MASTER BUS
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.8, ctx.currentTime);
      mainGain.connect(ctx.destination);

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-12, ctx.currentTime);
      limiter.knee.setValueAtTime(6, ctx.currentTime);
      limiter.ratio.setValueAtTime(4, ctx.currentTime);
      limiter.attack.setValueAtTime(0.005, ctx.currentTime);
      limiter.release.setValueAtTime(0.1, ctx.currentTime);
      limiter.connect(mainGain);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      limiter.connect(analyser);

      masterBusRef.current = {
        limiter,
        analyser,
        presenceMonitor: {
          rms: -60,
          modeStatus: 'ACTIVE',
          lastCheck: Date.now()
        }
      };

      // STEP 6: AUDIO PRESENCE MONITOR
      const presenceInterval = setInterval(() => {
        if (!masterBusRef.current) return;

        const data = new Uint8Array(masterBusRef.current.analyser.frequencyBinCount);
        masterBusRef.current.analyser.getByteFrequencyData(data);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length) / 128; // Normalize to 0-1
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -60;

        // Determine mode status
        let modeStatus: 'ACTIVE' | 'SILENT' | 'FALLBACK' = 'ACTIVE';
        if (rmsDb < -50) modeStatus = 'SILENT';
        else if (rmsDb < -30) modeStatus = 'FALLBACK';

        masterBusRef.current.presenceMonitor = {
          rms: Math.round(rmsDb),
          modeStatus,
          lastCheck: Date.now()
        };

        setAudioPresence({
          rms: Math.round(rmsDb),
          modeStatus
        });
      }, 1000); // Check every second

      // Clean up microphone stream if we got it but won't use it immediately
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
      }

      setIsBooting(true);
      console.log('Audio initialization completed, final context state:', ctx.state);
      console.log('Microphone permission status:', micPermissionStatus);
    } catch (error) {
      console.error('Audio initialization failed:', error);
      setMicPermissionStatus('denied');
      // Still proceed to booting state even if audio fails
      // This allows the UI to work even without sound
      setIsBooting(true);
    }
  };

  const handleModeChange = async (newMode: Mode) => {
    if (isFlipping || mode === newMode) return;

    if (isAudioStarted) {
      await ensureResumed('mode_switch');
      // Additional delay to ensure AudioContext is fully ready
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // For MEMORY mode, ensure proper microphone cleanup before switching
    if (mode === Mode.MEMORY && newMode !== Mode.MEMORY) {
      // Give time for microphone cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setMode(newMode);
    setIsFlipping(true);
    setTimeout(() => setDisplayMode(newMode), 200);
    setTimeout(() => setIsFlipping(false), 400);
  };

  // central step ticker (~8fps) for UI timing/diagnostics - optimized for mobile
  useEffect(() => {
    const tickInterval = isMobile ? 200 : 140; // Slower on mobile to save battery
    const id = window.setInterval(() => {
      setTick(v => v + 1);
      tickRateRef.current.count += 1;
      const now = performance.now();
      if (now - tickRateRef.current.last >= 1000) {
        tickRateRef.current.hz = tickRateRef.current.count;
        tickRateRef.current.count = 0;
        tickRateRef.current.last = now;
      }
    }, tickInterval);
    return () => window.clearInterval(id);
  }, [isMobile]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const check = () => {
      setPanelOverflow(el.scrollHeight - 1 > el.clientHeight);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    setPanelOverflow(el.scrollHeight - 1 > el.clientHeight);
  }, [displayMode, isBooting, isAudioStarted, tick]);

  useEffect(() => {
    if (!isAudioStarted) return;
    const interval = setInterval(() => {
      setRilkeIndex(prev => (prev + 1) % RILKE_FRAGMENTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isAudioStarted]);

  useEffect(() => {
    if (!isAudioStarted) return;
    const accidentChars = ["*", "?", "!", "X", "§", "¶", "†", "‡"];
    const spawnAccident = () => {
      if (Math.random() > 0.8) { // Reduced spawn rate
        setAccidents(prev => {
          const newAccidents = [...prev, {
            x: Math.floor(Math.random() * 100),
            y: Math.floor(Math.random() * 100),
            char: accidentChars[Math.floor(Math.random() * accidentChars.length)],
            life: 3 + Math.random() * 5 // Shorter life
          }];
          return newAccidents.slice(-15); // Limit to 15 accidents max
        });
      }
      const delay = isMobile ? 2000 + Math.random() * 6000 : 1000 + Math.random() * 5000; // Slower spawn
      setTimeout(spawnAccident, delay);
    };
    spawnAccident();
    const decayInterval = setInterval(() => {
      setAccidents(prev => prev.map(a => ({ ...a, life: a.life - 1 })).filter(a => a.life > 0));
    }, 1500); // Slower decay
    return () => { clearInterval(decayInterval); };
  }, [isAudioStarted, isMobile]);

  useEffect(() => {
    if (isBooting) {
      let logIndex = 0;
      const logInterval = setInterval(() => {
        if (logIndex < BOOT_LOGS.length) {
          setBootLogs(prev => [...prev, BOOT_LOGS[logIndex]]);
          logIndex++;
          setBootProgress((logIndex / BOOT_LOGS.length) * 100);
        } else {
          clearInterval(logInterval);
          setTimeout(() => { setIsBooting(false); setIsAudioStarted(true); }, 600);
        }
      }, 350);
      return () => clearInterval(logInterval);
    }
  }, [isBooting]);

  // Install robust resume hooks once audio is started
  useEffect(() => {
    if (!isAudioStarted) return;
    const ctx = audioContextRef.current;
    if (ctx) setAudioState((ctx as any).state || 'unknown');

    const onVisibility = () => {
      const vs = document.visibilityState as 'visible' | 'hidden';
      setPageVisibility(vs);
      if (vs === 'visible') {
        // Brief delay to ensure page is fully visible
        setTimeout(() => ensureResumed('visibilitychange'), 100);
      } else if (vs === 'hidden') {
        // Optional: could suspend on hide to save battery, but keep running for now
      }
    };
    const onPageShow = () => ensureResumed('pageshow');
    const onFocus = () => ensureResumed('focus');
    const onTouchEnd = () => ensureResumed('touchend');
    const onPointerDown = () => ensureResumed('pointerdown');
    const onClick = () => ensureResumed('click');

    // Enhanced AudioContext state monitoring
    const onStateChange = () => {
      if (ctx) setAudioState((ctx as any).state || 'unknown');
    };
    if (ctx) ctx.onstatechange = onStateChange;

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('touchend', onTouchEnd, { passive: true } as any);
    window.addEventListener('pointerdown', onPointerDown, { passive: true } as any);
    window.addEventListener('click', onClick, { passive: true } as any);

    const poll = setInterval(() => {
      if (audioContextRef.current) setAudioState((audioContextRef.current as any).state || 'unknown');
    }, 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('touchend', onTouchEnd as any);
      window.removeEventListener('pointerdown', onPointerDown as any);
      window.removeEventListener('click', onClick as any);
      if (ctx) ctx.onstatechange = null;
      clearInterval(poll);
    };
  }, [isAudioStarted]);

  const formatTimeHMS = (t: number | null) => {
    if (!t) return '--:--:--';
    const d = new Date(t);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const renderBootScreen = () => {
    const barWidth = 20;
    const filled = Math.floor((bootProgress / 100) * barWidth);
    const progressBar = `[${'#'.repeat(filled)}${'-'.repeat(barWidth - filled)}] ${Math.floor(bootProgress)}%`;
    return (
      <div className={`flex-1 flex flex-col p-8 font-mono overflow-hidden ${getContrastOpacity()}`}>
        <div className="flex-1 space-y-2 text-[11px] opacity-80 overflow-y-auto pb-4">
          {bootLogs.map((log, i) => <div key={i} className="animate-[fade_0.1s_ease-in]">{log}</div>)}
        </div>
        <div className="shrink-0 border-t border-current border-opacity-20 pt-8 flex flex-col items-center">
          <div className="text-[10px] tracking-[0.3em] mb-4 opacity-50 uppercase">Booting_System_Core</div>
          <div className="text-xs tabular-nums tracking-widest">{progressBar}</div>
        </div>
      </div>
    );
  };

  const getMotionClass = () => {
    // Disable animations on mobile if reduced motion is preferred
    if (isMobile && prefersReducedMotion) return '';
    return isAnimatedUI ? 'animate-ui-motion' : '';
  };

  const modeLabel = (m: Mode) => m === Mode.DRONE ? 'NIHIL_CORE' : m;

  // Color inversion callback for KHS moment boundaries
  const handleColorInversion = () => {
    const now = Date.now() / 1000; // seconds
    // Only allow inversion if 90+ seconds since last switch
    if (now - lastColorSwitch >= 90) {
      setIsInverted(prev => !prev);
      setLastColorSwitch(now);
    }
  };

  const renderActiveMode = () => {
    switch (displayMode) {
      case Mode.DRONE:
        return <DroneMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} isMobile={isMobile} />;
      case Mode.ENVIRON:
        return <EnvironMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} isMobile={isMobile} />;
      case Mode.MEMORY:
        return <MemoryMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} embedded isMobile={isMobile} />;
      case Mode.GENERATIVE:
        return <GenerativeMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} isMobile={isMobile} />;
      case Mode.ORACLE:
        return <OracleMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} isMobile={isMobile} onScore={addScore} onColorInversion={handleColorInversion} />;
      case Mode.KHS:
        return <KHSMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} isMobile={isMobile} onColorInversion={handleColorInversion} />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="app-root font-mono select-none"
      style={{ backgroundColor: colors.bg, color: colors.text, perspective: '1200px', filter: isInverted ? 'invert(1)' : 'none' }}
      onClick={() => { lastInteractRef.current = Date.now(); if (isZenMode) setIsZenMode(false); }}
      onMouseMove={() => { lastInteractRef.current = Date.now(); if (isZenMode) setIsZenMode(false); }}
    >
      <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden opacity-30">
        {accidents.map((a, i) => (
          <div key={i} className={`absolute text-[10px] ${getMotionClass()}`} style={{ left: `${a.x}%`, top: `${a.y}%`, opacity: a.life / 10 }}>
            {a.char}
          </div>
        ))}
      </div>



      <StatusBar theme={theme} />

      <main className={`content-area relative z-10 flex flex-col p-6 pt-12 pb-2 ${isZenMode ? 'opacity-5' : 'opacity-100'}`}>
        <header className={`mb-6 flex flex-col gap-1 shrink-0 ${getMotionClass()}`}>
          <div className="flex justify-between items-baseline text-[9px] opacity-40 uppercase tracking-[0.2em]">
            <span>ENGINE: {isAudioStarted ? (isZenMode ? '4_33_OBSERVATION' : RILKE_FRAGMENTS[rilkeIndex]) : (isBooting ? 'SYNC_ACTIVE' : 'NO_CARRIER')}</span>
            <span className="text-[8px] opacity-60 tabular-nums">{getCrypticScore()}</span>
            <span>REV: DR-5.CAGE_EDITION</span>
          </div>
          <div className="flex justify-between items-end border-b border-current border-opacity-40 pb-2">
            <div>
              <div className="text-[10px] opacity-50 mb-[-4px]">SIGNAL_CTR</div>
              <h1 className="text-xl font-bold tracking-tight uppercase">
                {isBooting ? 'BOOT_SEQ' : modeLabel(mode)}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-1">
               <span onClick={() => setContrast(prev => prev === 4 ? 1 : prev + 1)} className="text-[10px] cursor-pointer hover:underline opacity-80 tabular-nums">
                [ CONT: {'|'.repeat(contrast)}{'.'.repeat(4-contrast)} ]
              </span>
              <div className="flex gap-2">
                <span onClick={generateRandomTheme} className="text-[10px] cursor-pointer hover:underline opacity-80">[ CH_COLOR ]</span>
                <span onClick={resetToDefault} className="text-[10px] cursor-pointer hover:underline opacity-80">[ DEFAULT ]</span>
                <span onClick={() => setIsInverted(!isInverted)} className="text-[10px] cursor-pointer hover:underline opacity-80">[ INVERT ]</span>
                <span onClick={() => setIsAnimatedUI(!isAnimatedUI)} className={`text-[10px] cursor-pointer hover:underline ${isAnimatedUI ? 'font-bold opacity-100' : 'opacity-40'}`}>[ UI_ANIM ]</span>
                <span onClick={openInfo} className="text-[10px] cursor-pointer hover:underline opacity-80">[ INFO ]</span>
                {import.meta.env.DEV && (
                  <span onClick={() => setShowResp(true)} className="text-[10px] cursor-pointer hover:underline opacity-80">[ RESP_TEST ]</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* AUDIO DIAGNOSTICS */}
        {isAudioStarted && (
          <div className={`text-[9px] opacity-50 uppercase tracking-[0.2em] mb-3 tabular-nums ${getMotionClass()}`}>
            AUDIO_DIAG: [ STATE:{audioState?.toString?.().toUpperCase?.() || 'UNK'} ] [ LAST:{formatTimeHMS(lastResumeAt)} ] [ EVT:{lastResumeReason} ] [ RESUMES:{resumeCount} FAILS:{resumeFailCount} ] [ VIS:{pageVisibility.toUpperCase()} ]
          </div>
        )}

        <div
          ref={panelRef}
          className={`flex-1 relative border border-current border-opacity-20 flex flex-col min-h-0 ${isFlipping ? 'flip-active' : ''} ${getContrastOpacity()} ${getMotionClass()}`}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {isZenMode ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-1 h-1 bg-current animate-pulse"></div>
            </div>
          ) : !isAudioStarted && !isBooting ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className={`text-[10px] opacity-40 mb-12 uppercase tracking-[0.3em] leading-loose max-w-[240px] ${getMotionClass()}`}>
                I HAVE NOTHING TO SAY<br/>AND I AM SAYING IT...
              </div>

              {/* Microphone permission status */}
              {micPermissionStatus !== 'unknown' && (
                <div className={`text-[9px] mb-4 uppercase tracking-[0.2em] ${micPermissionStatus === 'granted' ? 'opacity-60 text-green-400' : micPermissionStatus === 'requesting' ? 'opacity-60 text-yellow-400' : 'opacity-60 text-red-400'}`}>
                  MIC_ACCESS: {micPermissionStatus.toUpperCase()}
                </div>
              )}

              <span
                onClick={initializeAudio}
                className="enter-btn text-xs cursor-pointer tracking-[0.4em] uppercase font-bold border border-current px-6 py-4 transition-none"
                style={{ ['--hover-bg' as any]: colors.text, ['--hover-fg' as any]: colors.bg }}
              >
                [ ENTER_THE_ROOM ]
              </span>

              <div className={`text-[8px] opacity-30 mt-4 uppercase tracking-[0.3em] max-w-[280px] leading-relaxed ${getMotionClass()}`}>
                MICROPHONE USED FOR:<br/>
                MEMORY MODE ANALYSIS<br/>
                ORACLE MODE SENSING
              </div>
            </div>
          ) : isBooting ? (
            renderBootScreen()
          ) : (
            <div className={`w-full h-full content-scroll ${getMotionClass()}`}>
              <div className="ascii-grid" style={{ gridTemplateColumns: 'repeat(var(--cols), minmax(0, 1fr))' }}>
                <Panel title={modeLabel(displayMode)} collapsedOnXs>
                  {renderActiveMode()}
                </Panel>
              </div>
            </div>
          )}
        </div>

        {/* Navigation - visible on landing page with low opacity, animates after entry */}
        <nav className={`mt-2 tabbar flex items-center shrink-0 transition-opacity duration-1000 ${isAudioStarted ? 'opacity-100' : 'opacity-20'}`}>
          <div className="flex gap-4 overflow-x-auto no-scrollbar flex-1">
            {Object.values(Mode).map(m => (
              <span
                key={m}
                onClick={() => handleModeChange(m)}
                className={`text-[11px] tracking-widest uppercase whitespace-nowrap ${getMotionClass()} ${
                  mode === m ? 'font-bold underline cursor-pointer' : 'opacity-40 hover:opacity-100 cursor-pointer'
                }`}
              >
                {modeLabel(m)}
              </span>
            ))}
          </div>
          {import.meta.env.DEV && (
            <span className="text-[10px] opacity-60 cursor-pointer ml-4" onClick={() => setDebugOverlay(v => !v)}>
              [ DEBUG_OVERLAY ]
            </span>
          )}
        </nav>
      </main>

      {showInfo && (
        <InfoPage
          onClose={closeInfo}
          isAnimated={isAnimatedUI}
          isMobile={isMobile}
          colors={colors}
        />
      )}
      {import.meta.env.DEV && debugOverlay && (
        <div className="absolute top-12 right-4 z-[300] text-[10px] p-3 border border-current bg-black bg-opacity-70 max-w-[260px] space-y-1">
          <div>VIEWPORT: {window.innerWidth}x{window.innerHeight}</div>
          <div>MODE: {displayMode}</div>
          <div>TICK_HZ: {tickRateRef.current.hz.toFixed(0)}</div>
          <div>OVERFLOW: {panelOverflow ? 'YES' : 'NO'} ({panelRef.current?.clientHeight ?? 0}/{panelRef.current?.scrollHeight ?? 0})</div>
          <div>MOBILE: {isMobile ? 'YES' : 'NO'}</div>
          <div>REDUCED_MOTION: {prefersReducedMotion ? 'YES' : 'NO'}</div>
        </div>
      )}
      {import.meta.env.DEV && showResp && (
        <DevResponsiveTester onClose={() => setShowResp(false)} />
      )}

      <style>{`
        @keyframes fade {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes breath {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
        @keyframes flip-step {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(90deg); }
          100% { transform: rotateY(0deg); }
        }
        @keyframes ui-motion {
          0% { transform: translate(0, 0) skew(0deg); }
          20% { transform: translate(-0.5px, 0.5px) skew(0.2deg); }
          40% { transform: translate(0.5px, -0.5px) skew(-0.2deg); }
          60% { transform: translate(-0.5px, -0.5px) skew(0.1deg); }
          80% { transform: translate(0.5px, 0.5px) skew(-0.1deg); }
          100% { transform: translate(0, 0) skew(0deg); }
        }
        .breath-grid {
          animation: breath 10s steps(10, end) infinite;
        }
        .animate-ui-motion {
          animation: ui-motion 0.3s steps(4) infinite;
          /* Respect prefers-reduced-motion */
          @media (prefers-reduced-motion: reduce) {
            animation: none;
          }
        }
        .flip-active {
          animation: flip-step 0.4s steps(6) forwards;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .info-card .card-inner.flipped { transform: rotateY(180deg); }
        .enter-btn:hover { background: var(--hover-bg); color: var(--hover-fg); }
      `}</style>
    </div>
  );
};

export default App;
