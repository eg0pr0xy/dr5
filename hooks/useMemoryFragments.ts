import { useState, useCallback, useEffect } from 'react';
import { MemoryFragment } from '../types/audio';

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const generateRilkeLine = (): string => {
  const OPEN = [
    'BEAUTY', 'ANGEL', 'BREATH', 'SECRET', 'SILENCE', 'TERROR', 'FORM', 'OPEN', 'STATUE', 'DARK', 'MORNING', 'NIGHT'
  ];
  const VERB = [
    'IS', 'BECOMES', 'DWELLS', 'RISES', 'WHISPERS', 'UNFOLDS', 'BURNS', 'LISTENS', 'EMERGES'
  ];
  const QUAL = [
    'TERRIBLE', 'INFINITE', 'INVISIBLE', 'INNER', 'RADIANT', 'INEFFABLE', 'QUIET', 'DREADFUL', 'SACRED'
  ];
  const CLOSE = [
    'IN_US', 'IN_THE_OPEN', 'IN_THE_ROOM', 'BEYOND_WORDS', 'WITHOUT_END', 'AMONG_THINGS', 'UNDER_SKIN'
  ];
  const TEMPLATES = [
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)}`,
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)} ${pick(CLOSE)}`,
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(CLOSE)}`,
    () => `EVERY_${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)}`,
    () => 'YOU_MUST_CHANGE_YOUR_LIFE',
  ];
  return pick(TEMPLATES)();
};

export const useMemoryFragments = () => {
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);

  const updateFragments = useCallback(() => {
    setFragments(prev => {
      const decayed = prev
        .map(f => ({ ...f, life: f.life - 1, opacity: f.opacity * 0.95 }))
        .filter(f => f.life > 0);

      const spawns = Math.random() > 0.6 ? (Math.random() > 0.8 ? 2 : 1) : 0;
      for (let i = 0; i < spawns; i++) {
        decayed.push({
          x: Math.floor(Math.random() * 80) + 10,
          y: Math.floor(Math.random() * 80) + 10,
          content: generateRilkeLine(),
          opacity: 1,
          life: 10 + Math.random() * 16,
          isVibrating: false,
        });
      }
      return decayed;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateFragments, 500);
    return () => clearInterval(interval);
  }, [updateFragments]);

  return fragments;
};
