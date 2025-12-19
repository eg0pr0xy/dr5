import { useState, useCallback, useRef } from 'react';
import type { TouchEventHandler } from 'react';
import { TouchFieldState } from '../types/audio';
import { MemoryAudioEngine } from '../engines/MemoryAudioEngine';

export const useTouchField = (engine: MemoryAudioEngine | null) => {
  const [state, setState] = useState<TouchFieldState>({
    isActive: false,
    tilt: 0,
    density: 0.5,
    grainWidth: 160
  });
  
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartWidthRef = useRef<number>(160);
  const fieldRectRef = useRef<DOMRect | null>(null);
  
  const onTouchStart: TouchEventHandler<HTMLDivElement> = useCallback((e) => {
    setState(prev => ({ ...prev, isActive: true }));
    fieldRectRef.current = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartWidthRef.current = state.grainWidth;
    }
  }, [state.grainWidth]);
  
  const onTouchMove: TouchEventHandler<HTMLDivElement> = useCallback((e) => {
    if (!fieldRectRef.current) {
      fieldRectRef.current = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    }
    
    const rect = fieldRectRef.current;
    
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const nx = (t.clientX - rect.left) / rect.width; // 0..1
      const ny = (t.clientY - rect.top) / rect.height; // 0..1
      const newTilt = Math.max(-1, Math.min(1, (nx - 0.5) * 2));
      const newDensity = Math.max(0, Math.min(1, 1 - ny));
      
      setState(prev => ({
        ...prev,
        tilt: newTilt,
        density: newDensity
      }));
      
      if (engine) {
        engine.updateSpectralTilt(newTilt);
        engine.updateParameters({ density: newDensity });
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      
      if (pinchStartDistRef.current) {
        const scale = dist / Math.max(1, pinchStartDistRef.current);
        const newWidth = Math.max(60, Math.min(320, Math.round(pinchStartWidthRef.current * scale)));
        
        setState(prev => ({ ...prev, grainWidth: newWidth }));
        
        if (engine) {
          engine.updateParameters({ grainDuration: newWidth / 1000 });
        }
      }
    }
    
    // Prevent page scroll/zoom during gesture
    try { e.preventDefault(); } catch {}
  }, [engine]);
  
  const onTouchEnd: TouchEventHandler<HTMLDivElement> = useCallback(() => {
    setState(prev => ({ ...prev, isActive: false }));
    pinchStartDistRef.current = null;
  }, []);
  
  const handlers = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd
  };
  
  return { state, handlers };
};
