import React, { useState, useEffect } from 'react';

interface InfoPageProps {
  onClose: () => void;
  isAnimated?: boolean;
  isMobile?: boolean;
  colors?: { bg: string; text: string; border: string };
}

const InfoPage: React.FC<InfoPageProps> = ({
  onClose,
  isAnimated = true,
  isMobile = false,
  colors = { bg: '#0A0A0A', text: '#E5D9C4', border: '#E5D9C4' }
}) => {
  const [bootLogs, setBootLogs] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [showContent, setShowContent] = useState(false);

  const motionClass = isAnimated ? 'animate-ui-motion' : '';

  useEffect(() => {
    const systemLogs = [
      "> INIT_INFO_SYSTEM...",
      "> LOADING_MODE_DATABASE...",
      "> ACCESSING_CORE_SPECIFICATIONS...",
      "> RENDERING_INTERFACE_ELEMENTS...",
      "> ESTABLISHING_DATA_CONNECTION...",
      "> SYSTEM_READY."
    ];

    let lineIndex = 0;
    const bootInterval = setInterval(() => {
      if (lineIndex < systemLogs.length) {
        setBootLogs(prev => [...prev, systemLogs[lineIndex]]);
        setCurrentLine(lineIndex + 1);
        lineIndex++;
      } else {
        clearInterval(bootInterval);
        setTimeout(() => setShowContent(true), 500);
      }
    }, 600);

    return () => clearInterval(bootInterval);
  }, []);

  const getContrastOpacity = (level: number) => {
    switch(level) {
      case 1: return 'opacity-[0.5]';
      case 2: return 'opacity-[0.7]';
      case 3: return 'opacity-[0.85]';
      case 4: return 'opacity-100';
      default: return 'opacity-100';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: colors.bg }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] overflow-hidden border border-current border-opacity-20 ${getContrastOpacity(3)} ${motionClass}`}
        style={{ backgroundColor: colors.bg, color: colors.text }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex justify-between items-center p-4 border-b border-current border-opacity-20 ${motionClass}`}>
          <div>
            <div className="text-lg font-bold uppercase tracking-tight">DR5 AUDIO INTERFACE</div>
            <div className="text-[10px] opacity-60 uppercase tracking-[0.2em]">SYSTEM INFORMATION TERMINAL</div>
          </div>
          <div className="text-[10px] opacity-60">
            STATUS: <span className={currentLine < 6 ? "animate-pulse" : ""}>
              {currentLine < 6 ? 'BOOTING' : 'READY'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] font-mono">
          {/* Boot Logs */}
          {currentLine > 0 && (
            <div className="mb-6">
              <div className="text-[11px] opacity-60 uppercase tracking-[0.2em] mb-3">SYSTEM INITIALIZATION</div>
              <div className="space-y-1">
                {bootLogs.map((log, i) => (
                  <div key={i} className={`text-[10px] animate-[fade_0.1s_ease-in] ${motionClass}`}>
                    {log}
                  </div>
                ))}
                {currentLine < 6 && (
                  <div className="text-[10px] opacity-40 animate-pulse">
                    {'> PROCESSING...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          {showContent && (
            <div className={`space-y-6 animate-[fade_0.5s_ease-in] ${motionClass}`}>
              {/* Welcome */}
              <div className="text-center">
                <div className="text-sm opacity-80 mb-2">WELCOME TO DR5 SYSTEM TERMINAL</div>
                <div className="text-[11px] opacity-60">REV: DR-5.CAGE_EDITION</div>
              </div>

              {/* Core Specifications */}
              <div>
                <div className="text-[11px] opacity-60 uppercase tracking-[0.2em] mb-3">SYSTEM CORE SPECIFICATIONS</div>
                <div className="text-[10px] leading-relaxed space-y-2 opacity-80">
                  <div>DR5 is an experimental web audio interface exploring Cagean indeterminacy through real-time DSP and ASCII visualisation. Designed for contemplative listening, it requires careful technical setup for optimal performance.</div>
                  <div>Performance may vary by device and browser. Built with React 19 + TypeScript and native Web Audio API.</div>
                </div>
              </div>

              {/* Operational Modes */}
              <div>
                <div className="text-[11px] opacity-60 uppercase tracking-[0.2em] mb-3">OPERATIONAL MODES</div>
                <div className="text-[10px] leading-relaxed space-y-1 opacity-80">
                  <div><span className="opacity-60">DRONE:</span> Harmonic carrier with drift, FM modulation, and sub harmonics</div>
                  <div><span className="opacity-60">ENVIRON:</span> Spatial resonance simulation with room modes</div>
                  <div><span className="opacity-60">MEMORY:</span> Prepared acoustic space with grain feedback and Rilke fragments</div>
                  <div><span className="opacity-60">GENERATIVE:</span> Cellular automata mapped to harmonic filter banks</div>
                  <div><span className="opacity-60">ORACLE:</span> I-Ching hexagram generation via traditional coin method</div>
                  <div><span className="opacity-60">KHS:</span> Stockhausen homage with spectral moment structures</div>
                </div>
              </div>

              {/* Philosophical Foundation */}
              <div>
                <div className="text-[11px] opacity-60 uppercase tracking-[0.2em] mb-3">PHILOSOPHICAL FOUNDATION</div>
                <div className="text-[10px] leading-relaxed space-y-2 opacity-80">
                  <div className="text-sm mb-1">"I have nothing to say and I am saying it."</div>
                  <div className="text-[9px] opacity-60 mb-2">— John Cage, 4'33" (1962)</div>
                  <div>DR5 rejects modern UX convenience in favor of a rigid, terminal-based aesthetic that rewards patient observation and long-duration focus on subtle sonic transformations.</div>
                </div>
              </div>

              {/* Technical Implementation */}
              <div>
                <div className="text-[11px] opacity-60 uppercase tracking-[0.2em] mb-3">TECHNICAL IMPLEMENTATION</div>
                <div className="text-[10px] leading-relaxed space-y-1 opacity-80">
                  <div><span className="opacity-60">Logic:</span> React 19 + TypeScript</div>
                  <div><span className="opacity-60">DSP:</span> Native Web Audio API (No external libraries)</div>
                  <div><span className="opacity-60">Visuals:</span> CSS Grid/Flexbox + JetBrains Mono</div>
                  <div><span className="opacity-60">Timing:</span> Step-based (150-600ms) for mechanical precision</div>
                </div>
              </div>

              {/* Close Instruction */}
              <div className="text-center pt-4 border-t border-current border-opacity-10">
                <div className={`text-[10px] opacity-60 uppercase tracking-[0.2em] cursor-pointer hover:opacity-100 ${motionClass}`} onClick={onClose}>
                  [ TAP_OUTSIDE_OR_CLICK_TO_CLOSE ]
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default InfoPage;
