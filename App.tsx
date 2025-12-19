
import React, { useState, useEffect, useRef } from 'react';
import { Mode, Theme } from './types';
import StatusBar from './components/StatusBar';
import DroneMode from './components/DroneMode';
import EnvironMode from './components/EnvironMode';
import MemoryMode from './components/MemoryMode';
import GenerativeMode from './components/GenerativeMode';
import OracleMode from './components/OracleMode';
import KHSMode from './components/KHSMode';

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
  const [isAnimatedUI, setIsAnimatedUI] = useState(false);
  const [isInverted, setIsInverted] = useState(false);
  const [customColors, setCustomColors] = useState({ bg: '#0A0A0A', text: '#E5D9C4' });
  const [rilkeIndex, setRilkeIndex] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastInteractRef = useRef<number>(Date.now());
  // Audio diagnostics
  const [audioState, setAudioState] = useState<string>('suspended');
  const [resumeCount, setResumeCount] = useState(0);
  const [resumeFailCount, setResumeFailCount] = useState(0);
  const [lastResumeReason, setLastResumeReason] = useState<string>('NONE');
  const [lastResumeAt, setLastResumeAt] = useState<number | null>(null);
  const [pageVisibility, setPageVisibility] = useState<'visible' | 'hidden'>(
    (typeof document !== 'undefined' ? (document.visibilityState as any) : 'visible')
  );

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

  const initializeAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Track state changes
      audioContextRef.current.onstatechange = () => {
        setAudioState((audioContextRef.current as any)?.state || 'unknown');
      };
    }
    // Attempt to resume on user gesture
    ensureResumed('ENTER_THE_ROOM');
    // Silent unlock pulse (iOS safety)
    try {
      const ctx = audioContextRef.current!;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(1, ctx.currentTime);
      o.connect(g);
      o.start();
      o.stop(ctx.currentTime + 0.05);
    } catch {}
    setIsBooting(true);
  };

  const handleModeChange = (newMode: Mode) => {
    if (!isAudioStarted || isFlipping || mode === newMode) return;
    // Ensure audio is resumed when switching modes (mobile safety)
    ensureResumed('mode_switch');
    setMode(newMode);
    setIsFlipping(true);
    setTimeout(() => setDisplayMode(newMode), 200);
    setTimeout(() => setIsFlipping(false), 400);
  };

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
      if (Math.random() > 0.7) {
        setAccidents(prev => [...prev, {
          x: Math.floor(Math.random() * 100),
          y: Math.floor(Math.random() * 100),
          char: accidentChars[Math.floor(Math.random() * accidentChars.length)],
          life: 5 + Math.random() * 10
        }]);
      }
      setTimeout(spawnAccident, 500 + Math.random() * 3000);
    };
    spawnAccident();
    const decayInterval = setInterval(() => {
      setAccidents(prev => prev.map(a => ({ ...a, life: a.life - 1 })).filter(a => a.life > 0));
    }, 1000);
    return () => { clearInterval(decayInterval); };
  }, [isAudioStarted]);

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
      if (vs === 'visible') ensureResumed('visibilitychange');
    };
    const onPageShow = () => ensureResumed('pageshow');
    const onFocus = () => ensureResumed('focus');
    const onTouchEnd = () => ensureResumed('touchend');
    const onPointerDown = () => ensureResumed('pointerdown');
    const onClick = () => ensureResumed('click');

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

  const getMotionClass = () => isAnimatedUI ? 'animate-ui-motion' : '';

  return (
    <div 
      className={`fixed inset-0 flex flex-col font-mono select-none overflow-hidden transition-all duration-300`}
      style={{ backgroundColor: colors.bg, color: colors.text, perspective: '1200px', filter: isInverted ? 'invert(1)' : 'none' }}
      onClick={() => { lastInteractRef.current = Date.now(); if (isZenMode) setIsZenMode(false); }}
      onMouseMove={() => { lastInteractRef.current = Date.now(); if (isZenMode) setIsZenMode(false); }}
    >
      <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden opacity-30">
        {accidents.map((a, i) => (
          <div key={i} className={`absolute text-[10px] transition-opacity duration-1000 ${getMotionClass()}`} style={{ left: `${a.x}%`, top: `${a.y}%`, opacity: a.life / 10 }}>
            {a.char}
          </div>
        ))}
      </div>

      <div 
        className="absolute inset-0 pointer-events-none animate-[breath_10s_ease-in-out_infinite]" 
        style={{ 
          backgroundImage: `linear-gradient(${colors.grid} 1px, transparent 1px), linear-gradient(90deg, ${colors.grid} 1px, transparent 1px)`, 
          backgroundSize: '20px 20px' 
        }} 
      />

      <StatusBar theme={theme} />

      <main className={`flex-1 overflow-hidden relative z-10 flex flex-col p-6 pt-12 pb-8 transition-opacity duration-[2s] ${isZenMode ? 'opacity-5' : 'opacity-100'}`}>
        <header className={`mb-6 flex flex-col gap-1 shrink-0 ${getMotionClass()}`}>
          <div className="flex justify-between items-baseline text-[9px] opacity-40 uppercase tracking-[0.2em]">
            <span>ENGINE: {isAudioStarted ? (isZenMode ? '4_33_OBSERVATION' : RILKE_FRAGMENTS[rilkeIndex]) : (isBooting ? 'SYNC_ACTIVE' : 'NO_CARRIER')}</span>
            <span>REV: DR-5.CAGE_EDITION</span>
          </div>
          <div className="flex justify-between items-end border-b border-current border-opacity-40 pb-2">
            <div>
              <div className="text-[10px] opacity-50 mb-[-4px]">SIGNAL_CTR</div>
              <h1 className="text-xl font-bold tracking-tight uppercase">
                {isBooting ? 'BOOT_SEQ' : (mode === Mode.DRONE ? 'RADIO_CORE' : mode)}
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
          className={`flex-1 relative overflow-hidden border border-current border-opacity-20 flex flex-col ${isFlipping ? 'flip-active' : ''} ${getContrastOpacity()} ${getMotionClass()}`}
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
              <span onClick={initializeAudio} className="text-xs cursor-pointer tracking-[0.4em] uppercase font-bold border border-current px-6 py-4 hover:bg-current hover:text-black transition-none">
                [ ENTER_THE_ROOM ]
              </span>
            </div>
          ) : isBooting ? (
            renderBootScreen()
          ) : (
            <div className={`w-full h-full ${getMotionClass()}`}>
              {displayMode === Mode.DRONE && <DroneMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
              {displayMode === Mode.ENVIRON && <EnvironMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
              {displayMode === Mode.MEMORY && <MemoryMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
              {displayMode === Mode.GENERATIVE && <GenerativeMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
              {displayMode === Mode.ORACLE && <OracleMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
              {displayMode === Mode.KHS && <KHSMode audioContext={audioContextRef.current!} isAnimated={isAnimatedUI} />}
            </div>
          )}
        </div>

        <nav className="mt-6 flex items-center shrink-0">
          <div className="flex gap-4 overflow-x-auto no-scrollbar flex-1">
            {Object.values(Mode).map(m => (
              <span
                key={m}
                onClick={() => handleModeChange(m)}
                className={`text-[11px] tracking-widest uppercase whitespace-nowrap ${getMotionClass()} ${
                  !isAudioStarted ? 'opacity-10 cursor-not-allowed' :
                  mode === m ? 'font-bold underline cursor-pointer' : 'opacity-40 hover:opacity-100 cursor-pointer'
                }`}
              >
                {m}
              </span>
            ))}
          </div>
        </nav>
      </main>

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
          20% { transform: translate(-1px, 1px) skew(0.5deg); }
          40% { transform: translate(1px, -1px) skew(-0.5deg); }
          60% { transform: translate(-1px, -1px) skew(0.3deg); }
          80% { transform: translate(1px, 1px) skew(-0.3deg); }
          100% { transform: translate(0, 0) skew(0deg); }
        }
        .animate-ui-motion {
          animation: ui-motion 0.2s steps(4) infinite;
        }
        .flip-active {
          animation: flip-step 0.4s steps(6) forwards;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default App;
