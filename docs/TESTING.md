# Testing and verification

## Automated checks

Run the complete local gate:

```bash
npm test
```

This runs:

1. an isolated strict TypeScript check over the game and UI source;
2. the production Vinext/Vite build and deployable-worker artifact validation;
3. a server-rendered metadata smoke test;
4. Node tests for career immutability/progression, mission transitions, hard
   landing damage, stable ground start, hold-to-command Nairobi-altitude liftoff,
   hover capture, assisted directional response and braking, advanced persistent
   collective, terrain non-penetration, yaw release/focus safety, input-axis mapping, Nairobi XYZ/provider
   decoding, Apache rotor/orientation assets, audio delivery, attribution, the
   token-free real-terrain default, swept projectile collision, intercept solutions,
   terrain masking, sensor dwell/lock/coast behavior, helicopter-first automatic
   acquisition, post-kill reacquisition, tactical contact snapshots, and
   flight-data/navigation derivations.

Lint separately with:

```bash
npm run lint
```

## Manual browser matrix

| Area | Required pass |
|---|---|
| Renderer | WebGPU launch, forced WebGL fallback, low/high/auto quality |
| Keyboard/mouse | Pointer lock, all axes, release Q/E across blur/pause, both weapons, target, camera |
| Controllers | Xbox standard mapping, DualSense/DualShock mapping, neutral shoulder yaw, haptics fallback |
| Missions | All stages, victory debrief, loss debrief, score and save update |
| Combat | Cannon/Hydra/Hellfire, ammo depletion, auto helicopter lock/reacquire, manual override, acquire/track/lock/mask/lost, lead cue, SAM warning |
| Feedback | Projectile streaks, exhaust/smoke, shockwaves, falling wreck/crash blast, radar/edge contacts, hit/critical/takedown markers, impact vignette, haptics and tones |
| Avionics | TAS/GS split, attitude, load, torque/margin, NAV bearing/range/ETE, mission modes |
| Career | Reload persistence, insufficient funds, max tier, stat accumulation |
| Co-op | Host/join in two browsers, pose smoothing, weapon events, disconnect |
| Lifecycle | Background auto-pause, focus-loss input release, resize, pointer release, repeated sortie disposal |
| PWA | Install prompt eligibility, reload update, offline cached shell |
| Real terrain | Nairobi DEM alignment, MSL altitude, map attribution, provider fallback |
| Flight regression | Ground spawn, Space/RT liftoff, hover capture, WASD/stick translation, auto-brake, advanced collective, slope contact |
| Audio | Seamless rotor loop, RPM/load response, sustained M230 fire, Hydra/Hellfire launch |
| Accessibility | Keyboard menu navigation, focus visibility, reduced motion, live status |

## Known environment constraint

Headless cloud browsers without a GPU may reject WebGL context creation. UI flows can
still be checked there, but sortie verification requires a browser with WebGL 2 or
WebGPU enabled. Automated GPU-backed browser coverage is a planned hardening item.
