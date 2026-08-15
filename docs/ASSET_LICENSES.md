# Third-party asset licenses

Third-party art and audio remain under their listed licenses. RotorFrontier source code remains
available under the repository's MIT License.

## AH-64E Apache “Guardian”

**AH-64E Apache “Guardian” by Jeyhun1985 is licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).**

- Creator: [Jeyhun1985](https://sketchfab.com/Jeyhun1985)
- Original model: [Sketchfab model page](https://sketchfab.com/3d-models/ah-64e-apache-guardian-9eb641f9179d413e87367ebd9b96347a)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Downloaded: 2026-08-15, Sketchfab 1K GLB distribution
- Bundled derivatives: `public/models/ah-64e-guardian.glb` and
  `public/models/ah-64e-guardian-lod.glb`

### Changes made

The downloaded 69.78 MB GLB was prepared for real-time browser use. Geometry was
simplified, pruned, deduplicated, and stripped of unused attributes. Textures were
resized to a 1,024-pixel maximum and converted to WebP. The optimized derivative is
15.15 MB. Rotor-motion meshes, runtime scale normalization, and scene placement are
implemented separately in RotorFrontier code.

A 7.19 MB performance LOD was additionally generated for lower-memory and lower-core
devices. It uses the same source, attribution, and license, with stronger geometry
simplification and 256-pixel texture limits. Both quality tiers therefore display an
Apache; the old procedural airframe is retained only as a load-failure safety fallback.

No endorsement by the model creator, Boeing, the U.S. Army, or GE Aerospace is
implied.

## Helicopter and weapon audio

### Helicopter Rotor Loop

**“Helicopter Rotor Loop.flac” by qubodup is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).**

- Creator: [qubodup](https://freesound.org/people/qubodup/)
- Original recording: [Freesound sound 187681](https://freesound.org/people/qubodup/sounds/187681/)
- License: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Bundled derivative: `public/audio/ah64-rotor-loop.mp3`
- Changes: high- and low-pass filtering, MP3 encoding, seamless runtime looping,
  and RPM/load-responsive playback, gain, and filtering

### M230 cannon base recording

**“A collection of gun sounds” by AVW is licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).**

- Creator: [AVW](https://opengameart.org/users/avw)
- Original collection: [OpenGameArt asset page](https://opengameart.org/content/collection-gun-sounds)
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)
- Bundled derivative: `public/audio/m230-cannon.mp3`
- Changes: filtered and level-adjusted MP3 derivative; runtime pitch variation,
  transient shaping, and synthesized low-frequency pressure layer

### Rocket launch

**“Rocket launch” by qubodup is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).**

- Creator: [qubodup](https://opengameart.org/users/qubodup)
- Original recording: [OpenGameArt asset page](https://opengameart.org/content/rocket-launch)
- License: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Bundled derivative: `public/audio/rocket-launch.mp3`
- Changes: trimmed, filtered, faded, level-adjusted, and MP3 encoded; runtime
  envelopes and playback rates distinguish Hydra and Hellfire launches

The sampled recordings are routed through the browser Web Audio API and layered
with original procedural synthesis. No endorsement by the original creators is
implied.
