# Real-world terrain and map import

RotorFrontier now uses two coordinated real-world layers: elevation that gameplay
queries for collision and terrain clearance, and imagery draped onto that same
surface. The first implemented theatre is central Nairobi, Kenya.

## Implemented Nairobi theatre

| Property | Production-alpha value |
|---|---|
| Centre | -1.286389, 36.817223 (WGS84) |
| Playable area | 8.2 km × 8.2 km |
| Tile neighbourhood | 3 × 3 XYZ tiles at zoom 13 |
| DEM ground sample | Approximately 19.10 m per source pixel at the theatre latitude |
| Rendered map texture | 1024 × 1024 crop aligned to the playable bounds |
| No-token source | AWS Open Data Mapzen Terrarium DEM + OpenStreetMap standard tiles |
| Optional sources | MapTiler Terrain RGB + satellite; Mapbox Terrain-RGB + satellite |

On sortie load, `RealTerrain.ts` converts the Nairobi coordinate to fractional XYZ
tile space, fetches only the nine required DEM and imagery tiles, and decodes a
768 × 768 elevation mosaic. A bilinear synchronous sampler converts local game
metres into the same mosaic used to construct the terrain mesh. Aircraft spawn
height, radar altitude, ground contact, AI clearance, and weapon collision therefore
agree with the visible surface.

The open source is active by default and needs no player credential. A public
MapTiler key or Mapbox access token can be entered in Settings to activate satellite
imagery and that provider's Terrain RGB. The token remains in browser local storage
and is never committed. A commercial-provider error falls back to the open source;
complete tile failure falls back to the original procedural terrain so a sortie can
still launch. Source attribution remains visible on the in-flight HUD.

## Viable production approaches

| Approach | Visual result | Fit with the current Babylon runtime | Requirements | Recommendation |
|---|---|---|---|---|
| Terrain RGB DEM + satellite imagery | Real topography and real aerial surface imagery | Strong; tiles become Babylon meshes and CPU height grids | Provider key, selected coordinates, attribution, tile cache | Best first production implementation |
| Cesium World Terrain + imagery | Global streamed terrain with mature geospatial LOD | Medium; Babylon documents a CesiumJS integration, but two scene systems must share camera and depth | Cesium ion token and commercial plan for commercial use | Strong when a global globe is required |
| Google Photorealistic 3D Tiles | Highest-fidelity textured buildings and terrain in covered areas | Medium-to-low; use CesiumJS or a standards-compatible 3D Tiles renderer | Google Cloud project, billing, restricted API key, policy-compliant attribution | Best optional urban visual layer |
| Self-hosted DEM/orthophoto tiles | Full control and offline mission packs | Strong after data preparation | GIS ingestion, reprojection, tiling, storage, updates, and regional licenses | Later, for curated theatres |

Primary references:

- [Babylon.js dynamic terrain](https://doc.babylonjs.com/communityExtensions/dynamicTerrains/)
- [Babylon.js and CesiumJS integration](https://doc.babylonjs.com/communityExtensions/Babylon.js%2BExternalLibraries/BabylonJS_and_CesiumJS/)
- [OGC 3D Tiles 1.1 specification](https://docs.ogc.org/cs/22-025r4/22-025r4.html)
- [Cesium World Terrain](https://cesium.com/learn/ion-sdk/ref-doc/Terrain.html)
- [Cesium 3D Tileset streaming](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html)
- [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles)
- [MapTiler Terrain RGB](https://docs.maptiler.com/guides/map-tiling-hosting/data-hosting/rgb-terrain-by-maptiler/)
- [MapTiler Tiles API](https://docs.maptiler.com/cloud/api/tiles/)
- [Mapbox elevation data](https://docs.mapbox.com/data/tilesets/guides/access-elevation-data/)
- [Mapbox Satellite](https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/)
- [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
- [Mapzen Terrarium format](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

## Production pipeline

The Babylon-native tiled terrain path preserves the fixed-step flight, weapon
collision, AI clearance, and mission systems already built around a synchronous
`terrainHeight(x, z)` query.

1. Define a mission theatre by WGS84 centre coordinate, width, and height.
2. Resolve the intersecting XYZ tiles at several zoom levels.
3. Decode provider-specific RGB elevation values into metre-based height grids.
4. Convert latitude/longitude to a local East-North-Up metre frame around the mission
   origin, avoiding large world-coordinate precision errors.
5. Build skirted, edge-stitched Babylon mesh tiles and drape matching satellite tiles
   across them.
6. Keep decoded height grids in an LRU cache so flight physics, terrain following,
   AI, radar altitude, weapon collision, and line-of-sight use the same elevations.
7. Stream high-resolution tiles around the aircraft and progressively coarser rings
   toward the horizon; load mission-critical tiles before enabling launch.
8. Add licensed buildings, roads, vegetation masks, and landmarks as separate layers
   so gameplay objects remain controllable and destructible.

Photorealistic 3D Tiles should be an optional presentation layer, not the collision
source. Photogrammetry contains holes, transient objects, and irregular surfaces, so
a simplified DEM/collision mesh should remain authoritative underneath it.

The current alpha completes steps 1–6 for one preloaded Nairobi tile neighbourhood.
Multi-resolution ring streaming and richer vector-derived scene layers remain later
production work.

## Next production decisions

- Whether public online streaming is acceptable or mission areas must work offline.
- Expected monthly players and bandwidth, which determine provider plan and cache
  design.
- Whether the game is commercial, because provider licenses, attribution, session
  quotas, and imagery redistribution rules differ.
- Whether to add Cesium/Google Photorealistic 3D Tiles as a non-authoritative visual
  layer for urban landmarks.
- Which Nairobi roads, buildings, vegetation masks, and landmarks should become
  game-owned vector or 3D mission layers.

No API key should be committed. Public browser tokens must be domain-restricted;
secret service credentials belong in hosted environment configuration or a narrow
tile proxy. Required provider attribution must remain visible in the game UI.
