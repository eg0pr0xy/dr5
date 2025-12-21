import { useState, useCallback, useEffect, useRef } from 'react';
import { MemoryFragment } from '../types/audio';

// Meditative word generation - contemplative emergence from sound
const generatePresenceWord = (audioParams: {
  spectralCentroid: number;
  rms: number;
  grainRate: number;
  currentF0: number;
  timeSinceStart: number;
}): string => {
  const { spectralCentroid, rms, grainRate, currentF0, timeSinceStart } = audioParams;

  // Temporal evolution - words change based on meditation duration
  const meditationPhase = Math.floor(timeSinceStart / 30) % 7; // 7 phases of contemplation

  // Spectral presence - how the sound fills space
  const PRESENCE = spectralCentroid > 60 ? [
    'HERE', 'PRESENT', 'MANIFEST', 'EMERGENT', 'REVEALED', 'APPEARING'
  ] : spectralCentroid > 30 ? [
    'QUIET', 'SUBTLE', 'GENTLE', 'SOFT', 'TENDER', 'DELICATE'
  ] : [
    'DEEP', 'INNER', 'SILENT', 'HIDDEN', 'DORMANT', 'WAITING'
  ];

  // Energy flow - how sound moves through time
  const FLOW = rms > 0.15 ? [
    'RISING', 'FLOWING', 'MOVING', 'SHIFTING', 'CHANGING', 'EVOLVING'
  ] : rms > 0.08 ? [
    'BREATHING', 'PULSING', 'WAVING', 'DRIFTING', 'GLIDING', 'FLOATING'
  ] : [
    'RESTING', 'WAITING', 'LISTENING', 'ATTENDING', 'OBSERVING', 'CONTEMPLATING'
  ];

  // Texture quality - nature of the sound
  const TEXTURE = grainRate > 20 ? [
    'TEXTURED', 'GRAINED', 'PATTERNED', 'WOVEN', 'INTERWOVEN'
  ] : grainRate > 10 ? [
    'SMOOTH', 'CONTINUOUS', 'FLOWING', 'CONNECTED', 'LINKED'
  ] : [
    'PURE', 'SINGLE', 'FOCUSED', 'CLEAR', 'DISTINCT'
  ];

  // Relational awareness - how elements connect
  const RELATION = currentF0 > 200 ? [
    'TOGETHER', 'CONNECTED', 'LINKED', 'JOINED', 'UNITED'
  ] : currentF0 > 120 ? [
    'RELATING', 'RESPONDING', 'ANSWERING', 'ECHOING', 'REFLECTING'
  ] : [
    'ALONE', 'SINGLE', 'SOLITARY', 'INDIVIDUAL', 'ONE'
  ];

  // Meditative templates - simple, contemplative structures
  const TEMPLATES = [
    () => pick(PRESENCE),
    () => `${pick(PRESENCE)} ${pick(FLOW)}`,
    () => `${pick(TEXTURE)} ${pick(RELATION)}`,
    () => `${pick(FLOW)} ${pick(PRESENCE)}`,
    () => `LISTENING ${pick(RELATION)}`,
    () => `SOUND ${pick(FLOW)}`,
    () => `SILENCE ${pick(PRESENCE)}`,
    () => `PRESENCE ${pick(TEXTURE)}`,
    // Phase-dependent deep contemplation
    () => meditationPhase === 0 ? 'BEGINNING' :
         meditationPhase === 1 ? 'LISTENING' :
         meditationPhase === 2 ? 'ATTENDING' :
         meditationPhase === 3 ? 'OBSERVING' :
         meditationPhase === 4 ? 'CONTEMPLATING' :
         meditationPhase === 5 ? 'UNDERSTANDING' : 'BEING'
  ];

  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
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
  const startTimeRef = useRef(Date.now());

  const updateFragments = useCallback(() => {
    const timeSinceStart = (Date.now() - startTimeRef.current) / 1000; // seconds

    setFragments(prev => {
      const decayed = prev
        .map(f => ({
          ...f,
          life: f.life - 1,
          opacity: f.opacity * 0.99, // Very slow decay for deep contemplation
          isVibrating: f.isVibrating && Math.random() > 0.4 // Gentle vibrations
        }))
        .filter(f => f.life > 0);

      // Meditative spawn rate - very gentle, contemplative emergence
      const baseSpawnRate = 0.4; // Even gentler spawns
      const audioActivity = audioParams ? (audioParams.rms * 1.5 + audioParams.grainRate / 30) : 0;
      const activityThreshold = Math.max(0.15, baseSpawnRate - audioActivity); // More conservative
      const spawns = Math.random() > activityThreshold ? 1 : 0;

      // Guarantee occasional emergence even in silence
      const meditationSpawn = Math.random() > 0.98; // 2% chance of contemplative emergence
      const finalSpawns = spawns > 0 ? spawns : (meditationSpawn ? 1 : 0);

      for (let i = 0; i < finalSpawns; i++) {
        const params = audioParams || {
          spectralCentroid: 40,
          rms: 0.03,
          grainRate: 6,
          currentF0: 100
        };

        const wordParams = {
          ...params,
          timeSinceStart
        };

        decayed.push({
          x: Math.floor(Math.random() * 70) + 15, // More centered
          y: Math.floor(Math.random() * 70) + 15,
          content: generatePresenceWord(wordParams),
          opacity: 0.7, // Start more subtle
          life: 25 + Math.random() * 35, // Much longer contemplation time
          isVibrating: params.rms > 0.08 || Math.random() > 0.85, // Rare, gentle vibrations
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
