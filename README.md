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

- Custom 60 Hz fixed-step helicopter dynamics: collective, cyclic, anti-torque,
  rotor energy, translational lift, ground effect, wind, drag, fuel, component
  damage, hard landings, and optional stability assist
- 8.2 km procedural battlespace with elevation, river, vegetation, buildings,
  helipad, navigation beacons, shadowing, fog, rain, and continuous day/night light
- Three multi-stage operations: reconnaissance, armoured interdiction, and storm
  extraction, each with live objective tracking and after-action scoring
- Autonomous hostile helicopters, moving armour, and guided SAM threats with
  patrol, pursuit, lead targeting, engagement envelopes, and damage states
- M230 cannon, Hydra rockets, and target-locked Hellfire missiles with ammunition,
  ballistics, homing, collision, damage, explosions, target cycling, and warnings
- Persistent local career with credits, XP, ratings, sortie statistics, and five-tier
  engine, armour, sensor, and stores upgrades
- Two-player WebRTC co-op using a low-latency unreliable flight-state channel and a
  reliable combat-event channel; no account or central game server required
- Cockpit, chase, and cinematic cameras; pointer lock; adaptive WebGPU/WebGL 2
  rendering; FXAA, bloom, dynamic quality selection, and procedural Web Audio
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
| Cyclic pitch / roll | `W S` / `A D`, captured mouse | Left stick |
| Anti-torque pedals | `Q E` | LB / RB |
| Collective | `Shift` / `Ctrl` | RT / LT |
| Look | Captured mouse | Right stick |
| M230 cannon | Left click / `Space` | A / Cross |
| Rocket or missile | Right click | B / Circle |
| Cycle secondary weapon | `R` | X / Square |
| Cycle target | `Tab` | D-pad up |
| Change camera | `C` | Y / Triangle |
| Toggle hover assist | `H` | Left-stick click |
| Pause | `P` / `Esc` | Menu / Options |

Click the flight view to capture the pointer. Browser and operating-system mappings
can vary for non-standard controllers; the settings screen provides deadzone and
axis inversion controls.

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
and [Testing](docs/TESTING.md) for implementation details and tradeoffs.

## Browser baseline

A recent Chromium, Firefox, or Safari desktop browser with WebGL 2 is required.
WebGPU, controller vibration, and installability are progressive enhancements.
The browser must permit WebRTC for co-op and IndexedDB for persistent career saves.

## Project status

The first production milestone is implemented on the active development branch.
Planned hardening includes TURN-backed matchmaking, authoritative shared AI state,
additional aircraft, configurable bindings, spatial audio, terrain streaming,
mission authoring tools, automated GPU-device testing, and accessibility presets.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Security reports
should follow [SECURITY.md](SECURITY.md). RotorFrontier is available under the
[MIT License](LICENSE).
