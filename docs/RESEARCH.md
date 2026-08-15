# Research and design basis

This document records the primary technical and aviation references used for the
first production milestone and the implementation decisions they informed. It is a
design record, not a claim of training-device fidelity.

## Rotorcraft handling model

The FAA Helicopter Flying Handbook chapters on aerodynamics, controls, performance,
basic maneuvers, night operations, and emergencies informed the relationship among
collective, cyclic, anti-torque control, rotor RPM, translational lift, ground effect,
wind, and low-level operations.

- [FAA Helicopter Flying Handbook](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/helicopter_flying_handbook)
- [FAA Rotorcraft Flying Handbook (PDF)](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/faa-h-8083-21.pdf)
- [NASA: ground proximity and helicopter rotor induced efficiency](https://ntrs.nasa.gov/citations/19770017115)
- [NASA: survey of rotor inflow models for flight dynamics](https://ntrs.nasa.gov/citations/19900051466)

Decision: use a readable six-degree-style rigid-body approximation with explicit
rotor-energy, density, translational-lift, and ground-effect terms. A blade-element
or free-wake model would be expensive and poorly matched to a browser action game;
the documented simplification is deliberate.

## Rendering and world systems

Babylon.js was selected for its first-party support for WebGPU and WebGL fallback,
scene graphs, cameras, thin instances, particles, shadow maps, post-processing,
audio integration, picking, and optional Havok physics.

- [Babylon.js engine specifications](https://www.babylonjs.com/specifications/)
- [Babylon.js documentation](https://doc.babylonjs.com/)

Decision: keep helicopter aerodynamics in a custom deterministic integrator while
using Babylon for rendering and spatial systems. Terrain is generated once per
sortie and vegetation uses thin instances to keep draw-call count practical.

## Input

The W3C Gamepad specification defines controller axes, buttons, standard mappings,
timestamps, connection state, and optional haptic actuators. Pointer Lock provides
unbounded relative mouse motion suitable for flight input.

- [W3C Gamepad specification](https://www.w3.org/TR/gamepad/)
- [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)

Decision: poll active controllers in the fixed update path, apply a configurable
radial deadzone, detect the last active device, edge-detect discrete actions, and
treat vibration as a progressive enhancement. Keyboard, captured mouse, and gamepad
feed the same normalized `ControlFrame`.

## Real-time co-op

WebRTC data channels support ordered/reliable and unordered/limited-retransmission
delivery. Fast-changing flight snapshots benefit from dropping late packets, while
discrete weapon events must remain ordered and reliable.

- [WebRTC data channel specification](https://www.w3.org/TR/webrtc/#datachannel)
- [MDN `RTCDataChannel`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [MDN `createDataChannel`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel)

Decision: split flight state and combat events into separate channels, cap buffered
state, validate packets, and interpolate the remote aircraft. Manual offer/answer
signaling avoids collecting identity or running a signaling service in milestone 1.

## Persistence, audio, and installability

IndexedDB supports asynchronous structured client storage. Web Audio supports
precisely timed procedural sources and filtering. Service workers provide an
origin-scoped cache and offline request handling.

- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

Decision: save a versioned, validated career locally; synthesize rotor, cannon,
rocket, impact, and explosion layers at runtime; cache the application shell using a
network-first strategy so updates win when connected.

## Performance and quality targets

- Simulation: fixed 60 Hz with bounded catch-up.
- Network pose replication: 15 Hz plus visual interpolation.
- HUD: 12.5 Hz to limit React work.
- High/low terrain segments: 112 / 78.
- High/low vegetation instances: 620 / 260.
- Shadow maps: 2048 / 1024.
- State-channel backpressure ceiling: 48 KB.

These are initial safe targets, not universal guarantees. Browser GPU testing and
field telemetry should drive future per-device quality tiers.
