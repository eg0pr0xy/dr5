import { useState, useCallback, useEffect, useRef } from 'react';
import { MemoryFragment } from '../types/audio';

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// Enhanced Rilke text generation synchronized with audio parameters
const generateRilkeLine = (audioParams: {
  spectralCentroid: number;
  rms: number;
  grainRate: number;
  currentF0: number;
}): string => {
  // Map audio parameters to Rilke's poetic vocabulary
  const spectralCentroid = audioParams.spectralCentroid;
  const rms = audioParams.rms;
  const grainRate = audioParams.grainRate;
  const currentF0 = audioParams.currentF0;

  // Spectral brightness influences openness vs enclosure
  const OPEN = spectralCentroid > 50 ? [
    'BEAUTY', 'ANGEL', 'BREATH', 'SECRET', 'SILENCE', 'TERROR', 'FORM', 'OPEN', 'STATUE', 'DARK', 'MORNING', 'NIGHT'
  ] : [
    'CHAMBER', 'ROOM', 'DEPTHS', 'INTERIOR', 'CORE', 'CENTER', 'ABYSS', 'CAVERN', 'INNER_ROOM', 'SHADOW'
  ];

  // RMS energy influences verb intensity
  const VERB = rms > 0.1 ? [
    'IS', 'BECOMES', 'DWELLS', 'RISES', 'WHISPERS', 'UNFOLDS', 'BURNS', 'LISTENS', 'EMERGES'
  ] : [
    'SLEEPS', 'WAITS', 'RESTS', 'LINGERS', 'MURMURS', 'DREAMS', 'BREATHES', 'ECHOES'
  ];

  // Grain rate influences quality
  const QUAL = grainRate > 15 ? [
    'TERRIBLE', 'INFINITE', 'INVISIBLE', 'INNER', 'RADIANT', 'INEFFABLE', 'QUIET', 'DREADFUL', 'SACRED'
  ] : [
    'GENTLE', 'SOFT', 'QUIET', 'SUBTLE', 'TENDER', 'CALM', 'STILL', 'PEACEFUL'
  ];

  // Fundamental frequency influences spatial relationships
  const CLOSE = currentF0 > 150 ? [
    'IN_US', 'IN_THE_OPEN', 'IN_THE_ROOM', 'BEYOND_WORDS', 'WITHOUT_END', 'AMONG_THINGS', 'UNDER_SKIN'
  ] : [
    'IN_THE_DEPTHS', 'IN_THE_CORE', 'IN_THE_CHAMBER', 'WITHIN_THE_ROOM', 'IN_THE_SILENCE', 'IN_THE_CENTER'
  ];

  // Templates that create meaningful relationships
  const TEMPLATES = [
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)}`,
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)} ${pick(CLOSE)}`,
    () => `${pick(OPEN)} ${pick(VERB)} ${pick(CLOSE)}`,
    () => `EVERY_${pick(OPEN)} ${pick(VERB)} ${pick(QUAL)}`,
    () => 'YOU_MUST_CHANGE_YOUR_LIFE',
    // New templates that respond to audio state
    () => rms > 0.15 ? `${pick(OPEN)} ${pick(VERB)} LOUDER` : `${pick(OPEN)} ${pick(VERB)} QUIETER`,
    () => spectralCentroid > 60 ? `${pick(OPEN)} ${pick(VERB)} BRIGHTER` : `${pick(OPEN)} ${pick(VERB)} DARKER`,
    () => grainRate > 20 ? `${pick(OPEN)} ${pick(VERB)} MORE_FREQUENT` : `${pick(OPEN)} ${pick(VERB)} SPARINGLY`,
  ];

  return pick(TEMPLATES)();
};

export const useMemoryFragments = (audioParams?: {
  spectralCentroid: number;
  rms: number;
  grainRate: number;
  currentF0: number;
}) => {
  const [fragments, setFragments] = useState<MemoryFragment[]>([]);
  const lastAudioParams = useRef(audioParams);

  const updateFragments = useCallback(() => {
    setFragments(prev => {
      const decayed = prev
        .map(f => ({
          ...f,
          life: f.life - 1,
          opacity: f.opacity * 0.98, // Slower decay for contemplation
          isVibrating: f.isVibrating && Math.random() > 0.3 // Vibrations persist longer
        }))
        .filter(f => f.life > 0);

      // Spawn rate based on audio activity - made more aggressive
      const baseSpawnRate = 0.3; // Lower threshold for more frequent spawns
      const audioActivity = audioParams ? (audioParams.rms * 2.0 + audioParams.grainRate / 20) : 0;
      const activityThreshold = Math.max(0.1, baseSpawnRate - audioActivity); // Ensure minimum spawn chance
      const spawns = Math.random() > activityThreshold ? (Math.random() > 0.7 ? 2 : 1) : 0;

      // Guarantee at least occasional spawns even with no audio activity
      const forceSpawn = Math.random() > 0.95; // 5% chance of forced spawn
      const finalSpawns = spawns > 0 ? spawns : (forceSpawn ? 1 : 0);

      for (let i = 0; i < finalSpawns; i++) {
        const params = audioParams || {
          spectralCentroid: 50,
          rms: 0.05,
          grainRate: 8,
          currentF0: 110
        };

        decayed.push({
          x: Math.floor(Math.random() * 80) + 10,
          y: Math.floor(Math.random() * 80) + 10,
          content: generateRilkeLine(params),
          opacity: 1,
          life: 15 + Math.random() * 25, // Longer lifespan for contemplation
          isVibrating: params.rms > 0.1 || Math.random() > 0.7, // Vibrate with audio energy
        });
      }
      return decayed;
    });
  }, [audioParams]);

  useEffect(() => {
    // Slower update rate for contemplative experience
    const interval = setInterval(updateFragments, 800);
    return () => clearInterval(interval);
  }, [updateFragments]);

  return fragments;
};
