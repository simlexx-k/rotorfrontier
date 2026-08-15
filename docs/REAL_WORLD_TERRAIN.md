# Real-world terrain and map import research

RotorFrontier's current 8.2 km battlespace is procedurally generated. Replacing it
with an actual location requires two separate data layers: elevation that gameplay
can query for collision and line-of-sight, and visual imagery or photogrammetry that
the renderer can stream at several levels of detail.

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
- [Mapbox Terrain-RGB](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/)

## Recommended RotorFrontier pipeline

The lowest-risk route is a Babylon-native tiled terrain provider backed by MapTiler
Terrain RGB and satellite imagery, or Mapbox Terrain-RGB through its supported Raster
Tiles API. This preserves the fixed-step flight, weapon collision, AI clearance, and
mission systems already built around a synchronous `terrainHeight(x, z)` query.

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

## Decisions required before implementation

- The first real-world theatre and its centre coordinate or bounding box.
- Terrain provider: MapTiler/Mapbox for the Babylon-native path, or Cesium/Google for
  maximum photorealism and a larger renderer integration.
- Whether public online streaming is acceptable or mission areas must work offline.
- Expected monthly players and bandwidth, which determine provider plan and cache
  design.
- Whether the game is commercial, because provider licenses, attribution, session
  quotas, and imagery redistribution rules differ.

No API key should be committed. Public browser tokens must be domain-restricted;
secret service credentials belong in hosted environment configuration or a narrow
tile proxy. Required provider attribution must remain visible in the game UI.
