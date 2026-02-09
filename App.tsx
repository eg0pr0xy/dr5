import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mode, Theme } from './types';
import type { AudioDirectorSnapshot } from './types/audio';
import { AudioDirector } from './engines/AudioDirector';
import StatusBar from './components/StatusBar';
import DroneMode from './components/DroneMode';
import EnvironMode from './components/EnvironMode';
import MemoryMode from './components/MemoryMode';
import GenerativeMode from './components/GenerativeMode';
import OracleMode from './components/OracleMode';
import KHSMode from './components/KHSMode';
import Panel from './components/Panel';

const BOOT_LOGS = [
  '> INIT INSTRUMENT_DR5_BIOS...',
  '> CHECKING MEMORY_BANKS... OK',
  '> CALIBRATING NOISE_FLOOR...',
  '> ESTABLISHING MASTER_BUS...',
  '> LOADING MODE_ENGINES...',
  '> SYSTEM_READY.',
];

const createEmptySnapshot = (): AudioDirectorSnapshot => ({
  activeMode: null,
  audioState: 'suspended',
  outDb: -120,
  modeOut: 'SILENT',
  fallback: false,
  fallbackReason: null,
  mode: {
    [Mode.DRONE]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, bars: new Array(7).fill(0), cutoff: 0, resonance: 0, stepType: 'IDLE', signalStrength: 0, traunsteinActive: false, traunsteinIntensity: 'PRESENT' },
    [Mode.ENVIRON]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, matrix: Array.from({ length: 12 }, () => '.'.repeat(12)), activeCells: 0, roomFlux: 0, pressure: 0 },
    [Mode.MEMORY]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, rms: 0, source: 'FALLBACK', grainRate: 0, feedback: 0, ghostUntil: 0, f0: 0, memorySec: 10, reverbMix: 0.28 },
    [Mode.GENERATIVE]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, rows: Array.from({ length: 18 }, () => '.'.repeat(14)), rule: 110, invert: false, bandAmps: new Array(7).fill(0) },
    [Mode.ORACLE]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, rms: 0, source: 'FALLBACK', hexagram: [0, 0, 0, 0, 0, 0], text: 'LISTEN_FOR_EVENT', matrix24x8: Array.from({ length: 8 }, () => '.'.repeat(24)), densityGlyph: '░', phaseStep: 0, concreteIntensity: 'PRESENT' },
    [Mode.KHS]: { outDb: -120, modeOut: 'SILENT', fallback: false, fallbackReason: null, momentIndex: 1, momentTotal: 12, spectralBias: 'LOW', densityGlyph: '░', widthBar: 'L▯▯▯▯▯R', transitionProgress: 0, nextBoundarySec: 0, matrix24x8: Array.from({ length: 8 }, () => '.'.repeat(24)) },
  },
});

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>(Mode.DRONE);
  const [theme, setTheme] = useState<Theme>(Theme.DARK);
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [bootIndex, setBootIndex] = useState(0);
  const [snapshot, setSnapshot] = useState<AudioDirectorSnapshot>(createEmptySnapshot());
  const [isAnimatedUI, setIsAnimatedUI] = useState(false);
  const [customColors, setCustomColors] = useState({ bg: '#0A0A0A', text: '#E5D9C4' });

  const ctxRef = useRef<AudioContext | null>(null);
  const directorRef = useRef<AudioDirector | null>(null);

  const colors = useMemo(() => {
    if (theme === Theme.CUSTOM) {
      return { bg: customColors.bg, text: customColors.text, border: customColors.text };
    }
    return theme === Theme.DARK
      ? { bg: '#0A0A0A', text: '#E5D9C4', border: '#E5D9C4' }
      : { bg: '#E5D9C4', text: '#1A1A1A', border: '#1A1A1A' };
  }, [theme, customColors]);

  useEffect(() => {
    if (!directorRef.current) return;
    const id = window.setInterval(() => {
      if (directorRef.current) setSnapshot(directorRef.current.getSnapshot());
    }, 120);
    return () => window.clearInterval(id);
  }, [isAudioStarted]);

  useEffect(() => {
    if (!isBooting) return;
    if (bootIndex >= BOOT_LOGS.length) {
      window.setTimeout(async () => {
        setIsBooting(false);
        setIsAudioStarted(true);
        await directorRef.current?.switchMode(mode);
      }, 300);
      return;
    }
    const id = window.setTimeout(() => setBootIndex((i) => i + 1), 280);
    return () => window.clearTimeout(id);
  }, [isBooting, bootIndex, mode]);

  useEffect(() => {
    return () => {
      directorRef.current?.dispose();
      directorRef.current = null;
    };
  }, []);

  const initializeAudio = async () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!directorRef.current) {
      directorRef.current = new AudioDirector(ctxRef.current);
    }
    await directorRef.current.resume('ENTER_THE_ROOM');
    setBootIndex(0);
    setIsBooting(true);
  };

  const handleModeChange = async (newMode: Mode) => {
    if (!isAudioStarted) return;
    setMode(newMode);
    await directorRef.current?.switchMode(newMode);
  };

  const onModeParams = (params: Record<string, unknown>) => {
    directorRef.current?.setModeParams(mode, params);
  };

  const randomizeTheme = () => {
    const rnd = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    const bg = `#${rnd()}${rnd()}${rnd()}`;
    const hex = bg.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lum = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    const text = lum < 0.5 ? '#E5D9C4' : '#1A1A1A';
    setCustomColors({ bg, text });
    setTheme(Theme.CUSTOM);
  };

  const motionClass = isAnimatedUI ? 'animate-ui-motion' : '';

  return (
    <div className={`app-root font-mono select-none ${isAnimatedUI ? 'poetic-on' : ''}`} style={{ backgroundColor: colors.bg, color: colors.text }}>
      <StatusBar theme={theme} />

      <main className="content-area relative z-10 flex flex-col p-6 pt-12 pb-2">
        <header className={`mb-5 ${motionClass}`}>
          <div className="flex justify-between items-end border-b border-current border-opacity-40 pb-2">
            <div>
              <div className="text-[10px] opacity-50 mb-[-4px]">SIGNAL_CTR</div>
              <h1 className="text-xl font-bold tracking-tight uppercase">
                {mode === Mode.DRONE ? 'RADIO_CORE' : mode}
              </h1>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="cursor-pointer" onClick={() => setTheme(Theme.DARK)}>[ DARK ]</span>
              <span className="cursor-pointer" onClick={() => setTheme(Theme.LIGHT)}>[ LIGHT ]</span>
              <span className="cursor-pointer" onClick={randomizeTheme}>[ CH_COLOR ]</span>
              <span className={`cursor-pointer ${isAnimatedUI ? 'underline' : ''}`} onClick={() => setIsAnimatedUI((v) => !v)}>[ UI_ANIM ]</span>
            </div>
          </div>
        </header>

        {isAudioStarted && (
          <div className="text-[9px] opacity-60 uppercase tracking-[0.2em] mb-3 tabular-nums">
            AUDIO_DIAG: [ STATE:{snapshot.audioState.toUpperCase()} ] [ OUT:{snapshot.outDb.toFixed(1)}dB ] [ MODE_OUT:{snapshot.modeOut} ] [ FALLBACK:{snapshot.fallback ? 'ON' : 'OFF'} ] [ REASON:{snapshot.fallbackReason || 'NONE'} ]
          </div>
        )}

        <div className="flex-1 relative border border-current border-opacity-20 min-h-0 surface-shell">
          {!isAudioStarted && !isBooting ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="text-[10px] opacity-40 mb-10 uppercase tracking-[0.3em] leading-loose max-w-[260px]">
                I HAVE NOTHING TO SAY<br />AND I AM SAYING IT...
              </div>
              <span onClick={initializeAudio} className="text-xs cursor-pointer tracking-[0.4em] uppercase font-bold border border-current px-6 py-4">
                [ ENTER_THE_ROOM ]
              </span>
            </div>
          ) : isBooting ? (
            <div className="h-full flex flex-col p-8 font-mono overflow-hidden">
              <div className="flex-1 space-y-2 text-[11px] opacity-80 overflow-y-auto pb-4">
                {BOOT_LOGS.slice(0, bootIndex).map((line, i) => <div key={i}>{line}</div>)}
              </div>
              <div className="border-t border-current border-opacity-20 pt-6 text-xs tabular-nums tracking-widest">
                [{'#'.repeat(bootIndex).padEnd(BOOT_LOGS.length, '-')}] {Math.floor((bootIndex / BOOT_LOGS.length) * 100)}%
              </div>
            </div>
          ) : (
            <div className="h-full min-h-0">
              <Panel title={mode === Mode.DRONE ? 'RADIO_CORE' : mode}>
                {mode === Mode.DRONE && <DroneMode diagnostics={snapshot.mode[Mode.DRONE]} isAnimated={isAnimatedUI} onParams={onModeParams} />}
                {mode === Mode.ENVIRON && <EnvironMode diagnostics={snapshot.mode[Mode.ENVIRON]} isAnimated={isAnimatedUI} />}
                {mode === Mode.MEMORY && <MemoryMode diagnostics={snapshot.mode[Mode.MEMORY]} isAnimated={isAnimatedUI} onParams={onModeParams} />}
                {mode === Mode.GENERATIVE && <GenerativeMode diagnostics={snapshot.mode[Mode.GENERATIVE]} isAnimated={isAnimatedUI} onParams={onModeParams} />}
                {mode === Mode.ORACLE && <OracleMode diagnostics={snapshot.mode[Mode.ORACLE]} isAnimated={isAnimatedUI} onParams={onModeParams} />}
                {mode === Mode.KHS && <KHSMode diagnostics={snapshot.mode[Mode.KHS]} isAnimated={isAnimatedUI} />}
              </Panel>
            </div>
          )}
        </div>

        <nav className="mt-2 tabbar flex items-center">
          <div className="flex gap-4 overflow-x-auto no-scrollbar flex-1">
            {Object.values(Mode).map((value) => (
              <span
                key={value}
                onClick={() => handleModeChange(value)}
                className={`text-[11px] tracking-widest uppercase whitespace-nowrap ${motionClass} ${
                  !isAudioStarted
                    ? 'opacity-10 cursor-not-allowed'
                    : mode === value
                      ? 'font-bold underline cursor-pointer'
                      : 'opacity-40 cursor-pointer'
                }`}
              >
                {value}
              </span>
            ))}
          </div>
        </nav>
      </main>
      <style>{`
        @keyframes ui-motion {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-1px, 1px); }
          50% { transform: translate(1px, 0); }
          75% { transform: translate(0, -1px); }
          100% { transform: translate(0, 0); }
        }
        .animate-ui-motion {
          animation: ui-motion 0.2s steps(4) infinite;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default App;
