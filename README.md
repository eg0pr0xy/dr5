
# INSTRUMENT-DR5

> **REVISION:** DR-5.CAGE_EDITION  
> **STATUS:** OPERATIONAL  
> **SYSTEM:** RETRO-FUTURISTIC COMPUTATIONAL INSTRUMENT

INSTRUMENT-DR5 is a mobile-first web interface designed for scientific observation and sonic meditation. It rejects modern UX convenience in favor of a rigid, grid-based "terminal instrument" aesthetic.

---

## OPERATIONAL PHILOSOPHY

The DR5 station is not a musical tool in the traditional sense; it is a **Signal Processor and Indeterminate Field Generator**. It operates at the intersection of early electronic studio practice and aleatoric composition.

- **Non-Ornamental Visuals**: Every ASCII character and grid movement is a direct diagnostic of the internal audio state.
- **Indeterminacy**: Inspired by John Cage and Karlheinz Stockhausen, the system values "chance" as a primary structural element.
- **Perceptual Listening**: The instrument rewards long-duration focus on slow-evolving timbral shifts.

---

## SYSTEM MODES

### 1. RADIO_CORE (DRONE)

The stations primary harmonic carrier.
- **Controls**: `DRIFT` level adjusts phase instability; `FM_MOD` adds metallic sidebands; `SUB_IN` toggles a 27.5Hz fundamental.
- **Visuals**: A vertical diagnostic of 6 harmonic bands + noise texture.

### 2. ENVIRON
A spatial resonance simulation that treats the interface as an acoustic room.
- **Sonic Engine**: 5 resonant bandpass filters ringing at non-harmonic room frequencies.
- **Controls**: `DENSITY` modulates resonance intensity; `AIR_FLOW` introduces chaotic brownian noise bursts.
- **Visuals**: A 12x12 matrix of shifting ASCII "energy" cells.

### 3. MEMORY (THE PREPARED ROOM)

An environmental feedback loop using the stations microphone.
- **Controls**: `GHOSTS` trigger aleatoric re-injection of recorded grains; `PIPS` are prepared sonic incidents.
- **Visuals**: Fragments of "Cagean" text that vibrate when the room's memory is accessed.

### 4. GENERATIVE
Recursive cellular automata mapped to a harmonic filter bank.
- **Logic**: Rule 30 or Rule 110 automata.
- **Controls**: `RULE_SET` toggles logic; `FEEDBACK` routes the signal through a recursive lowpass filter.
- **Visuals**: Scrolling automata grid where cell intensity matches spectral amplitude.

### 5. ORACLE
A chance-based decision engine derived from the I-Ching.
- **Logic**: 6-line hexagram generation via binary "coin" tosses.
- **Controls**: `HI_SENS` adjusts microphone threshold for "Mushroom" growth residues.
- **Visuals**: Static hexagrams and "growth residues" triggered by volume peaks.

### 6. KHS (STOCKHAUSEN HOMAGE)
A speculative simulation of a 1950s Electronic Studio.
- **Sonic Engine**: 12-tone twin-detuned sine bank with waveshaper saturation.
- **Tuning**: A visual tuning dial and interactive scale for locking onto live radio signals (DLF).
- **Controls**: `LOCK` harmonics by clicking the spectral peaks; `SAT` controls tube-style saturation drive.
- **Visuals**: A vector-style tuning dial and a clickable "Harmonic Complexity" spectrum.

---

## CONTROLS & NAVIGATION

- **MODE SWITCHING**: Minimal text toggles at the bottom of the screen.
- **CONTRAST [CONT]**: Adjust interface opacity to match ambient lighting conditions.
- **COLOR [CH_COLOR]**: Swap between "Light Parchment" and "Deep Black" themes.
- **ZEN MODE**: After 30 seconds of inactivity, the system fades into an ultra-low-opacity observation state. Touch to wake.

---

## TECHNICAL SPECIFICATIONS

- **Logic**: React 19 + TypeScript
- **DSP**: Native Web Audio API (No libraries)
- **Visuals**: CSS Grid / Flexbox + JetBrains Mono
- **Framerate**: Step-based (150ms - 600ms) to preserve mechanical timing.

*"I have nothing to say and I am saying it."*  
**DR5_STATION // CAGE_EDITION**

---

## UI INVARIANTS (DO NOT BREAK)

- Monospace only, ASCII-first visuals; grid overlay stays visible; no rounded corners, shadows, gradients, or icons.
- Step-based motion only (150–600ms ticks); no smooth CSS transitions or rAF-driven UI loops; use discrete keyframe steps.
- Navigation is minimal text toggles; mode switches must update the active view without gating or duplicated handlers.
- Layout uses explicit grid/flex with `min-height: 0` scroll containers; no fixed heights without a scrollable region.
- Respect vh/dvh quirks by keeping the root container height-managed and avoiding scroll hijacks on mobile.
- Panels/ASCII blocks render with `white-space: pre` and snap to the grid; opacity/contrast controls should not change geometry.

---

## PWA INSTALLATION

- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/sw.js` (offline shell + dynamic icons)
- Icons: provided dynamically at `/icons/icon-192.png` and `/icons/icon-512.png` by the service worker.

Install steps
- Desktop (Chrome/Edge): open the app, use 'Install App' from the address bar menu.
- Android (Chrome): open menu -> 'Install app'.
- iOS/iPadOS (Safari): Share -> Add to Home Screen.

Offline behavior
- After the first online load, the app shell (index.html) is cached so navigations work offline.
- Static assets are cached on first use. Network audio sources (e.g., KHS radio) still require connectivity.
