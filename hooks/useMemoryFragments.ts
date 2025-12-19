import { useState, useCallback, useEffect } from 'react';
import { MemoryFragment } from '../types/audio';

export const useMemoryFragments = () => {
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);
  
  const updateFragments = useCallback(() => {
    setFragments(prev => {
      const decayed = prev.map(f => ({ 
        ...f, 
        life: f.life - 1, 
        opacity: f.opacity * 0.94 
      })).filter(f => f.life > 0);
      
      if (Math.random() > 0.75) {
        const CAGE_FRAGMENTS = ["4'33\"", "SILENCE", "EVENT", "CHANCE", "ROOM", "EMPTY", "I_CHING", "MUSHROOM", "DECAY", "LISTEN"];
        decayed.push({ 
          x: Math.floor(Math.random() * 80) + 10, 
          y: Math.floor(Math.random() * 80) + 10, 
          content: CAGE_FRAGMENTS[Math.floor(Math.random() * CAGE_FRAGMENTS.length)], 
          opacity: 1, 
          life: 8 + Math.random() * 12, 
          isVibrating: false 
        });
      }
      return decayed;
    });
  }, []);
  
  useEffect(() => {
    const interval = setInterval(updateFragments, 600);
    return () => clearInterval(interval);
  }, [updateFragments]);
  
  return fragments;
};
