import React, { useEffect, useState } from 'react';
import { MemoryFragment, TouchFieldState } from '../types/audio';

interface MemoryVisualizationProps {
  fragments: MemoryFragment[];
  touchField: { state: TouchFieldState; handlers: any };
  isAnimated: boolean;
  isMobile?: boolean;
}

const MemoryVisualization: React.FC<MemoryVisualizationProps> = ({
  fragments, touchField, isAnimated, isMobile = false
}) => {
  const motionClass = isAnimated ? 'animate-ui-motion' : '';
  const [scan, setScan] = useState(0);
  const [resonanceField, setResonanceField] = useState<number[][]>(
    Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => 0))
  );

  useEffect(() => {
    // Slower scan on mobile to save battery
    const scanDelay = isMobile ? 120 : 80;
    const id = window.setInterval(() => setScan(v => (v + 3) % 100), scanDelay);
    return () => window.clearInterval(id);
  }, [isMobile]);

  // Update resonance field based on fragments and touch
  useEffect(() => {
    const updateResonance = () => {
      setResonanceField(prev => {
        const newField = prev.map(row => [...row]);

        // Decay existing resonances
        for (let y = 0; y < newField.length; y++) {
          for (let x = 0; x < newField[y].length; x++) {
            newField[y][x] *= 0.92;
          }
        }

        // Add resonances from active fragments
        fragments.forEach(fragment => {
          if (fragment.opacity > 0.3) {
            const gridX = Math.floor((fragment.x / 100) * newField[0].length);
            const gridY = Math.floor((fragment.y / 100) * newField.length);
            if (gridX >= 0 && gridX < newField[0].length && gridY >= 0 && gridY < newField.length) {
              newField[gridY][gridX] += fragment.opacity * (fragment.isVibrating ? 1.5 : 1.0);
            }
          }
        });

        // Add touch field resonance
        if (touchField.state.isActive) {
          const touchX = Math.floor((50 / 100) * newField[0].length); // Assume center for now
          const touchY = Math.floor((50 / 100) * newField.length);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = touchY + dy;
              const nx = touchX + dx;
              if (nx >= 0 && nx < newField[0].length && ny >= 0 && ny < newField.length) {
                newField[ny][nx] += touchField.state.density * 0.5;
              }
            }
          }
        }

        return newField;
      });
    };

    const resonanceInterval = setInterval(updateResonance, 200);
    return () => clearInterval(resonanceInterval);
  }, [fragments, touchField.state]);

  return (
    <div className="flex-1 w-full h-full relative border border-current border-opacity-5 bg-black/5 overflow-hidden">
      {/* Resonance field background */}
      <div className="absolute inset-0 opacity-20">
        {resonanceField.map((row, y) => (
          <div key={y} className="flex">
            {row.map((val, x) => {
              const intensity = Math.min(val, 1);
              return (
                <div
                  key={x}
                  className="flex-1 aspect-square border border-current/10"
                  style={{
                    backgroundColor: intensity > 0 ? `rgba(255,255,255,${intensity * 0.1})` : 'transparent'
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Text fragments with enhanced effects */}
      {fragments.map((f, i) => (
        <div
          key={i}
          className={`absolute whitespace-nowrap transition-all duration-1000 ${
            f.isVibrating ? 'animate-pulse' : ''
          } ${motionClass}`}
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            opacity: f.opacity,
            fontSize: f.isVibrating ? '11px' : '10px',
            fontWeight: f.isVibrating ? 'bold' : 'normal',
            textShadow: f.isVibrating ? '0 0 4px currentColor' : 'none',
            transform: f.isVibrating ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          [ {f.content} ]
        </div>
      ))}

      {/* Touch field overlay */}
      <div
        className="absolute inset-0 z-20"
        style={{ touchAction: 'none' as any }}
        {...touchField.handlers}
      />

      {/* Enhanced diagnostics */}
      <div className={`absolute left-2 bottom-2 text-[9px] opacity-60 uppercase tracking-[0.2em] tabular-nums ${motionClass}`}>
        MEMORY_FIELD: [ FRAGMENTS:{fragments.length} ] [ RMS:{touchField.state.tilt.toFixed(2)} ] [ GRAINS:{touchField.state.density.toFixed(2)} ] [ {touchField.state.isActive ? 'RESONATING' : 'QUIET'} ]
      </div>



      {/* Multiple scan lines for memory effect */}
      <div className="absolute left-0 right-0" style={{ top: `${scan}%`, opacity: 0.08 }}>
        <div className="w-full h-[1px] bg-current"></div>
      </div>
      <div className="absolute left-0 right-0" style={{ top: `${(scan + 33) % 100}%`, opacity: 0.05 }}>
        <div className="w-full h-[1px] bg-current"></div>
      </div>
      <div className="absolute left-0 right-0" style={{ top: `${(scan + 66) % 100}%`, opacity: 0.03 }}>
        <div className="w-full h-[1px] bg-current"></div>
      </div>

      {/* Memory echo effect */}
      {fragments.slice(-3).map((f, i) => (
        <div
          key={`echo-${i}`}
          className="absolute whitespace-nowrap opacity-20"
          style={{
            left: `${f.x + (i + 1) * 2}%`,
            top: `${f.y + (i + 1) * 2}%`,
            fontSize: '8px',
            color: 'currentColor',
          }}
        >
          {f.content}
        </div>
      ))}
    </div>
  );
};

export default MemoryVisualization;
