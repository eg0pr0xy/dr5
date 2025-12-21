# Audit Mapping (Claim → Reality → Required Change)

| Audit Claim | Current Reality | Required Change |
| --- | --- | --- |
| Long-form stability | Multiple rAF + setInterval loops; fresh analyser arrays each tick; mic routed to speakers; ScriptProcessor fallback | Remove rAF in audio loops, reuse analyser buffers, decouple mic from destination, prefer worklet/fallback noise writer |
| DRONE indeterminacy & FM/Sub controls | FM toggle unused; sub toggle static; fast random steps; GC churn | Wire FM + sub gains with smooth ramps, slow step durations (0.6–3s+), reuse analyser buffers |
| Memory as prepared acoustic space | Mic sent to main gain; ghosts frequent; parameter sequencer fast (0.4–2.4s); no mic fallback | Gate mic capture (analysis-only), make ghosts rare/long, slow parameter cycles, add internal memory noise when mic unavailable |
| KHS slow architectural shifts | Works, but radio errors abrupt; visual rAF; cycle OK | Keep long fades, ensure radio ramp-down safe, drop rAF noise in UI |
| Oracle as bias system, not sonic trigger | Mic routed to destination; randomness cosmetic | Remove mic output to speakers; keep oracle as probability bias only |
| UI step-based ticks | rAF used in modes; intervals faster than 150ms | Remove rAF in audio-driven views; keep intervals ≥150ms |
