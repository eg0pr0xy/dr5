
# DR5 AUDIO INTERFACE

> **REVISION:** DR-5.CAGE_EDITION
> **STATUS:** OPERATIONAL
> **BUILD:** 2025-12-21 08:30 UTC+1
> **SYSTEM:** EXPERIMENTAL WEB AUDIO INTERFACE

DR5 is an experimental web audio interface for contemplative listening, exploring Cagean indeterminacy through real-time DSP and ASCII visualisation. Designed for extended listening sessions, it requires careful technical setup for optimal performance. Performance may vary by device and browser.

---

## OPERATIONAL PHILOSOPHY

The DR5 station is not a musical tool in the traditional sense; it is a **Signal Processor and Indeterminate Field Generator**. It operates at the intersection of early electronic studio practice and aleatoric composition.

- **Non-Ornamental Visuals**: Every ASCII character and grid movement is a direct diagnostic of the internal audio state.
- **Indeterminacy**: Inspired by John Cage and Karlheinz Stockhausen, the system values "chance" as a primary structural element.
- **Perceptual Listening**: The instrument rewards long-duration focus on slow-evolving timbral shifts.

---

## SYSTEM MODES

### 1. RADIO_CORE (DRONE)

The station's primary harmonic carrier with integrated Space Invaders gameplay.
- **Controls**: `DRIFT` level adjusts phase instability; `FM_MOD` adds metallic sidebands; `SUB_IN` toggles a 27.5Hz fundamental.
- **Gameplay**: ASCII Space Invaders overlay - destroy invaders to earn points, avoid enemy fire.
- **Visuals**: Vertical diagnostic of 6 harmonic bands + noise texture + real-time invader formation.

### 2. ENVIRON
A spatial resonance simulation that treats the interface as an acoustic room.
- **Sonic Engine**: 5 resonant bandpass filters ringing at non-harmonic room frequencies.
- **Controls**: `DENSITY` modulates resonance intensity; `AIR_FLOW` introduces chaotic brownian noise bursts.
- **Visuals**: A 12x12 matrix of shifting ASCII "energy" cells.

### 3. MEMORY (THE PREPARED ROOM)

An environmental feedback loop using the station's microphone for analysis only.
- **Controls**: `GHOSTS` trigger rare aleatoric re-injection (5-15min intervals); `PIPS` are prepared sonic incidents.
- **Visuals**: Fragments of "Cagean" text that vibrate when the room's memory is accessed.

### 4. GENERATIVE
Recursive cellular automata mapped to a harmonic filter bank.
- **Logic**: Rule 30 or Rule 110 automata.
- **Controls**: `RULE_SET` toggles logic; `FEEDBACK` routes the signal through a recursive lowpass filter.
- **Visuals**: Scrolling automata grid where cell intensity matches spectral amplitude.

### 5. ORACLE
A chance-based decision engine using authentic I-Ching hexagram generation.
- **Logic**: 6-line hexagram generation via traditional coin method (3 coins per line).
- **Controls**: `HI_SENS` adjusts microphone threshold for "Mushroom" growth residues.
- **Visuals**: Authentic hexagrams (broken/unbroken lines) and "growth residues" triggered by volume peaks.

### 6. KHS (STOCKHAUSEN HOMAGE)
A speculative simulation of a 1950s Electronic Studio with long-form spectral evolution.
- **Sonic Engine**: 14-partial Stockhausen-inspired harmonic field with moment-based evolution (60-180s states).
- **Radio Integration**: SHORTWAVE_EMU provides bandpassed noise with AM modulation and tuning gaps (no network dependency).
- **Controls**: Radio texture toggle; spectral evolution follows 20-60s crossfade transitions.
- **Visuals**: ASCII matrix changes discretely at moment boundaries; ASCII diagnostics show current spectral bias.

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

## DEPLOYMENT

### GitHub Pages

The project is configured for deployment to GitHub Pages at `https://eg0pr0xy.github.io/dr5/`.

**Deploy Steps:**
```bash
# Install dependencies (including gh-pages)
npm install

# Build and deploy
npm run deploy
```

**Configuration:**
- Repository: `eg0pr0xy/dr5`
- Branch: `gh-pages` (auto-created by gh-pages package)
- Base path: `/dr5/` (automatically set for production builds)

**GitHub Pages Setup:**
1. Go to repository Settings → Pages
2. Set source to "Deploy from a branch"
3. Select "gh-pages" branch and "/ (root)" folder
4. Save and wait for deployment

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
