# RotorFrontier

**A browser-native tactical helicopter flight and combat simulator.**

[Play the current production alpha](https://rotorfrontier.kiptookosgeisimon.chatgpt.site)

RotorFrontier combines an approachable flight-assist layer with rotorcraft-inspired
physics, open-world combat, mission-driven progression, adaptive weather, and
two-player peer-to-peer co-op. It runs directly in a modern desktop browser with
keyboard and mouse or a standard-layout game controller.

> Production alpha: the complete first playable milestone is available, but flight
> tuning, content volume, network relays, accessibility, and hardware coverage will
> continue to evolve.

## Current feature set

- A production-quality AH-64E Apache Guardian airframe with PBR materials,
  high/performance LOD assets, animated source-model rotor blades, true-to-scale
  dimensions, an interactive 3D hangar viewer, and a sourced aircraft dossier
- Custom 60 Hz fixed-step helicopter dynamics: collective, cyclic, anti-torque,
  rotor energy, translational lift, ground effect, wind, drag, fuel, component
  damage, hard landings, and optional stability assist
- 8.2 km georeferenced Nairobi theatre with streamed real-world elevation and map
  imagery; a no-token AWS/OpenStreetMap source works immediately, MapTiler and
  Mapbox satellite sources can be enabled locally, and procedural terrain remains
  an offline/service-failure fallback
- Three multi-stage operations: reconnaissance, armoured interdiction, and storm
  extraction, each with live objective tracking and after-action scoring
- Autonomous hostile helicopters, moving armour, and guided SAM threats with
  patrol, pursuit, lead targeting, engagement envelopes, and damage states
- M230 cannon, Hydra rockets, and target-locked Hellfire missiles with ammunition,
  ballistics, homing, swept collision, damage, explosions, and sensor-driven target
  acquisition with terrain masking, track quality/coasting, closure, and lead cues
- A 60 Hz flight-data computer with TAS/ground-speed separation, attitude and load,
  track/drift, torque and power margin, fuel endurance, waypoint bearing/range/ETE,
  and explicit ground/hover/climb/descent/cruise modes
- Combat UX with screen-space target brackets, lock/health bars, hit/critical/kill
  confirmations, impact vignettes, directional damage indicators, haptics, and tones
- Persistent local career with credits, XP, ratings, sortie statistics, and five-tier
  engine, armour, sensor, and stores upgrades
- Two-player WebRTC co-op using a low-latency unreliable flight-state channel and a
  reliable combat-event channel; no account or central game server required
- Cockpit, chase, and cinematic cameras; pointer lock; adaptive WebGPU/WebGL 2
  rendering; FXAA, bloom, dynamic quality selection, and compressed Web Audio
- Licensed sampled rotor, M230 cannon, and rocket recordings with RPM/load-responsive
  filtering, modeled turbine and low-frequency layers, and dynamic-range control
- Keyboard/mouse and W3C Gamepad API input with radial deadzones, standard mapping,
  hot device switching, remappable sensitivity/inversion, and supported haptics
- Installable PWA shell with network-first runtime caching and offline fallback

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Then open the URL printed by Vite. For a production verification pass:

```bash
npm test
```

`npm test` runs the isolated game typecheck, production build/artifact validation,
rendered metadata test, and deterministic career/mission/flight-model tests.

## Controls

| Action | Keyboard and mouse | Standard gamepad |
|---|---|---|
| Move forward / backward | `W S` or `↑ ↓` | Left stick Y |
| Move left / right | `A D` or `← →` | Left stick X |
| Turn left / right | `Q E` | LB / RB |
| Ascend / descend | `Space` / `C` | RT / LT |
| Look | Captured mouse | Right stick |
| M230 cannon | Left click / `F` | A / Cross |
| Rocket or missile | Right click | B / Circle |
| Cycle secondary weapon | `R` | X / Square |
| Cycle target | Wheel, `N`, `M`, or `Tab` | D-pad up |
| Change camera | `V` | Y / Triangle |
| Toggle arcade flight assist | `H` | Left-stick click |
| Pause | `P` / `Esc` | Menu / Options |

Click the flight view to capture the pointer. Browser and operating-system mappings
can vary for non-standard controllers; the settings screen provides deadzone and
axis inversion controls. Operations begin on the helipad at ground idle. Arcade
flight assist is the default: hold `Space` or RT to climb, hold `C` or LT to descend,
and release to capture a hover. Direction inputs command predictable aircraft-relative
motion and the helicopter automatically levels and brakes when released. Toggle the
assist with `H` or the left-stick button for persistent collective and unrestricted
cyclic control.

## Co-op connection

1. Both players select **Online co-op** from the briefing.
2. The host creates and sends an invite code.
3. The wingman pastes the invite, creates an answer, and sends it back.
4. The host pastes the answer. When the status reads **connected**, both launch the
   same operation.

Session descriptions are exchanged manually so no identity or signaling backend is
required. WebRTC encrypts the data connection. Public STUN discovery works for many
networks; restrictive symmetric NAT or enterprise firewalls may require a future
TURN relay.

## Architecture

The client is built with React 19, TypeScript, Vinext/Vite, Babylon.js 9, WebRTC,
the Web Audio API, IndexedDB, and Zod packet/storage validation. The flight model is
purpose-built and deterministic at a 60 Hz fixed step; Babylon handles rendering,
scene management, spatial effects, and GPU fallback.

See [Architecture](docs/ARCHITECTURE.md), [Research and design basis](docs/RESEARCH.md),
[real-world terrain implementation](docs/REAL_WORLD_TERRAIN.md), [third-party asset licenses](docs/ASSET_LICENSES.md),
and [Testing](docs/TESTING.md) for implementation details, attribution, and tradeoffs.

## Browser baseline

A recent Chromium, Firefox, or Safari desktop browser with WebGL 2 is required.
WebGPU, controller vibration, and installability are progressive enhancements.
The browser must permit WebRTC for co-op and IndexedDB for persistent career saves.

## Project status

The first production milestone is implemented on the active development branch.
Planned hardening includes TURN-backed matchmaking, authoritative shared AI state,
additional aircraft, configurable bindings, spatial audio, multi-LOD terrain streaming,
mission authoring tools, automated GPU-device testing, and accessibility presets.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Security reports
should follow [SECURITY.md](SECURITY.md). RotorFrontier is available under the
[MIT License](LICENSE).

The bundled AH-64E model and sampled audio are separately licensed third-party
assets. See [third-party asset licenses](docs/ASSET_LICENSES.md) for attribution and terms.
