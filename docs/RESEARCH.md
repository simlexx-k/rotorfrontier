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
using Babylon for rendering and spatial systems. The Nairobi theatre decodes a
real-world RGB elevation mosaic once per sortie, drapes the corresponding map tiles,
and gives rendering and simulation one shared height sampler. Vegetation uses thin
instances to keep draw-call count practical; procedural terrain is retained only as
a service/offline fallback.

The token-free source combines public Mapzen Terrarium tiles from the AWS Open Data
Registry with OpenStreetMap standard raster tiles. MapTiler and Mapbox Terrain RGB
plus satellite tiles are optional settings-backed sources. Requests are restricted
to the nine tiles needed for the selected theatre, browser HTTP caching is enabled,
and attribution is visible in-game.

- [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
- [Mapzen Terrarium elevation format](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [MapTiler Tiles API](https://docs.maptiler.com/cloud/api/tiles/)
- [Mapbox elevation-data guide](https://docs.mapbox.com/data/tilesets/guides/access-elevation-data/)
- [Mapbox Satellite](https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/)

## AH-64E airframe and visual asset pipeline

The player aircraft is presented as the Boeing AH-64E Apache Guardian. Published
manufacturer and service data informs the aircraft dossier: a two-person crew,
14.7 m length, 14.6 m main-rotor diameter, 4.7 m height, 6,838 kg mission gross
weight, 10,433 kg maximum operating weight, 164-knot maximum speed, 260-nautical-
mile combat range, and 2.6-hour endurance. GE's T700 reference supports the twin
T700-GE-701D powerplant identification and the 2,000-shaft-horsepower class figure.

- [Boeing AH-64 Apache specifications](https://www.boeing.com/defense/military-rotorcraft/ah-64-apache)
- [U.S. Army AH-64E performance and armament](https://www.army.mil/article/137579/ah_64e_apache_attack_helicopter)
- [GE Aerospace T700 family](https://www.geaerospace.com/military-defense/engines/t700)

The detailed 3D airframe is
[AH-64E Apache “Guardian” by Jeyhun1985](https://sketchfab.com/3d-models/ah-64e-apache-guardian-9eb641f9179d413e87367ebd9b96347a),
used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The source
1K GLB was simplified, pruned, deduplicated, texture-resized, and converted to WebP
for browser delivery. The resulting 15.15 MB asset retains 32 PBR materials while
cutting the original download by about 78 percent. The runtime scales it against
the published 14.6 m rotor diameter and adds lightweight rotor-motion effects.

Decision: load the full asset asynchronously on the high-quality tier and a separately
optimized Apache LOD on the low-quality tier. The procedural helicopter remains only
as an asset-load safety fallback. Published AH-64E values provide readable context
and presentation; the game's flight coefficients remain intentionally tuned for
hybrid-realism combat and are not a certified or engineering-grade Apache simulation.

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
