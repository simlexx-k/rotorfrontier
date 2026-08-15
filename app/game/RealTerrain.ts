import type { GameSettings, MapProvider, TerrainSource } from "./types";

export const NAIROBI_THEATRE = {
  name: "Nairobi Region · Kenya",
  latitude: -1.286389,
  longitude: 36.817223,
  worldSizeMetres: 8_200,
  zoom: 13,
} as const;

const TILE_SIZE = 256;
const TILE_RADIUS = 1;
const IMAGERY_SIZE = 1_024;
const EARTH_CIRCUMFERENCE_METRES = 40_075_016.68557849;

type RasterEncoding = "terrarium" | "terrain-rgb";

interface TileCoordinate {
  x: number;
  y: number;
}

interface TilePlan {
  x: number;
  y: number;
  z: number;
}

interface RasterSource {
  source: Exclude<TerrainSource, "procedural">;
  encoding: RasterEncoding;
  terrainUrl: (tile: TilePlan) => string;
  imageryUrl: (tile: TilePlan) => string;
}

interface PixelTile {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RealTerrainData {
  source: Exclude<TerrainSource, "procedural">;
  imageryCanvas: HTMLCanvasElement;
  centreElevationMetres: number;
  sampleHeight: (x: number, z: number) => number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const latitudeLongitudeToTile = (
  latitude: number,
  longitude: number,
  zoom: number,
): TileCoordinate => {
  const latitudeRadians = (clamp(latitude, -85.05112878, 85.05112878) * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * scale,
  };
};

export const metresPerPixelAtLatitude = (latitude: number, zoom: number) =>
  (Math.cos((latitude * Math.PI) / 180) * EARTH_CIRCUMFERENCE_METRES) /
  (2 ** zoom * TILE_SIZE);

export const decodeTerrariumHeight = (red: number, green: number, blue: number) =>
  red * 256 + green + blue / 256 - 32_768;

export const decodeTerrainRgbHeight = (red: number, green: number, blue: number) =>
  -10_000 + (red * 256 * 256 + green * 256 + blue) * 0.1;

const sourceFor = (provider: MapProvider, token: string): RasterSource => {
  const encodedToken = encodeURIComponent(token.trim());
  if (provider === "maptiler" && encodedToken) {
    return {
      source: "maptiler",
      encoding: "terrain-rgb",
      terrainUrl: ({ z, x, y }) =>
        `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}?key=${encodedToken}`,
      imageryUrl: ({ z, x, y }) =>
        `https://api.maptiler.com/tiles/satellite-v4/${z}/${x}/${y}?key=${encodedToken}`,
    };
  }
  if (provider === "mapbox" && encodedToken) {
    return {
      source: "mapbox",
      encoding: "terrain-rgb",
      terrainUrl: ({ z, x, y }) =>
        `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${encodedToken}`,
      imageryUrl: ({ z, x, y }) =>
        `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}.jpg90?access_token=${encodedToken}`,
    };
  }
  return {
    source: "open",
    encoding: "terrarium",
    terrainUrl: ({ z, x, y }) =>
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    imageryUrl: ({ z, x, y }) =>
      `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  };
};

const tilePlans = (centre: TileCoordinate, zoom: number): TilePlan[] => {
  const centreX = Math.floor(centre.x);
  const centreY = Math.floor(centre.y);
  const plans: TilePlan[] = [];
  for (let y = centreY - TILE_RADIUS; y <= centreY + TILE_RADIUS; y += 1) {
    for (let x = centreX - TILE_RADIUS; x <= centreX + TILE_RADIUS; x += 1) {
      plans.push({ x, y, z: zoom });
    }
  }
  return plans;
};

const fetchBitmap = async (url: string): Promise<ImageBitmap> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Map tile request failed (${response.status})`);
    return await createImageBitmap(await response.blob());
  } finally {
    window.clearTimeout(timer);
  }
};

const pixelsFromBitmap = (bitmap: ImageBitmap): PixelTile => {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not decode terrain pixels.");
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: image.width, height: image.height };
};

const writeHeightTile = (
  mosaic: Float32Array,
  mosaicSize: number,
  tile: PixelTile,
  tileColumn: number,
  tileRow: number,
  encoding: RasterEncoding,
) => {
  const decode = encoding === "terrarium" ? decodeTerrariumHeight : decodeTerrainRgbHeight;
  for (let outputY = 0; outputY < TILE_SIZE; outputY += 1) {
    const sourceY = Math.round((outputY / (TILE_SIZE - 1)) * (tile.height - 1));
    for (let outputX = 0; outputX < TILE_SIZE; outputX += 1) {
      const sourceX = Math.round((outputX / (TILE_SIZE - 1)) * (tile.width - 1));
      const sourceOffset = (sourceY * tile.width + sourceX) * 4;
      const destination =
        (tileRow * TILE_SIZE + outputY) * mosaicSize + tileColumn * TILE_SIZE + outputX;
      mosaic[destination] = decode(
        tile.data[sourceOffset],
        tile.data[sourceOffset + 1],
        tile.data[sourceOffset + 2],
      );
    }
  }
};

const bilinearSample = (
  values: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
) => {
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const xBlend = clampedX - x0;
  const yBlend = clampedY - y0;
  const upper = values[y0 * width + x0] * (1 - xBlend) + values[y0 * width + x1] * xBlend;
  const lower = values[y1 * width + x0] * (1 - xBlend) + values[y1 * width + x1] * xBlend;
  return upper * (1 - yBlend) + lower * yBlend;
};

const loadFromSource = async (source: RasterSource): Promise<RealTerrainData> => {
  const centre = latitudeLongitudeToTile(
    NAIROBI_THEATRE.latitude,
    NAIROBI_THEATRE.longitude,
    NAIROBI_THEATRE.zoom,
  );
  const plans = tilePlans(centre, NAIROBI_THEATRE.zoom);
  const minimumX = Math.min(...plans.map((tile) => tile.x));
  const minimumY = Math.min(...plans.map((tile) => tile.y));
  const tilesWide = TILE_RADIUS * 2 + 1;
  const mosaicSize = tilesWide * TILE_SIZE;
  const heightMosaic = new Float32Array(mosaicSize * mosaicSize);

  const terrainTiles = await Promise.all(
    plans.map(async (plan) => {
      const bitmap = await fetchBitmap(source.terrainUrl(plan));
      try {
        return { plan, pixels: pixelsFromBitmap(bitmap) };
      } finally {
        bitmap.close();
      }
    }),
  );
  for (const { plan, pixels } of terrainTiles) {
    writeHeightTile(
      heightMosaic,
      mosaicSize,
      pixels,
      plan.x - minimumX,
      plan.y - minimumY,
      source.encoding,
    );
  }

  const metresPerPixel = metresPerPixelAtLatitude(
    NAIROBI_THEATRE.latitude,
    NAIROBI_THEATRE.zoom,
  );
  const centrePixelX = (centre.x - minimumX) * TILE_SIZE;
  const centrePixelY = (centre.y - minimumY) * TILE_SIZE;
  const sampleHeight = (x: number, z: number) =>
    bilinearSample(
      heightMosaic,
      mosaicSize,
      mosaicSize,
      centrePixelX + x / metresPerPixel,
      centrePixelY - z / metresPerPixel,
    );

  const imageryCanvas = document.createElement("canvas");
  imageryCanvas.width = IMAGERY_SIZE;
  imageryCanvas.height = IMAGERY_SIZE;
  const imageryContext = imageryCanvas.getContext("2d");
  if (!imageryContext) throw new Error("The browser could not build the terrain texture.");
  const gradient = imageryContext.createLinearGradient(0, 0, 0, IMAGERY_SIZE);
  gradient.addColorStop(0, "#7d8062");
  gradient.addColorStop(1, "#4f6247");
  imageryContext.fillStyle = gradient;
  imageryContext.fillRect(0, 0, IMAGERY_SIZE, IMAGERY_SIZE);
  imageryContext.imageSmoothingEnabled = true;
  imageryContext.imageSmoothingQuality = "high";

  const halfWorldPixels = NAIROBI_THEATRE.worldSizeMetres / metresPerPixel / 2;
  const westPixel = centre.x * TILE_SIZE - halfWorldPixels;
  const northPixel = centre.y * TILE_SIZE - halfWorldPixels;
  const worldPixelSize = halfWorldPixels * 2;
  const imageScale = IMAGERY_SIZE / worldPixelSize;
  const imageryTiles = await Promise.all(
    plans.map(async (plan) => {
      try {
        return { plan, bitmap: await fetchBitmap(source.imageryUrl(plan)) };
      } catch {
        return { plan, bitmap: null };
      }
    }),
  );
  for (const { plan, bitmap } of imageryTiles) {
    if (!bitmap) continue;
    const destinationX = (plan.x * TILE_SIZE - westPixel) * imageScale;
    const destinationY = (plan.y * TILE_SIZE - northPixel) * imageScale;
    const destinationSize = TILE_SIZE * imageScale;
    imageryContext.drawImage(
      bitmap,
      destinationX,
      destinationY,
      destinationSize,
      destinationSize,
    );
    bitmap.close();
  }

  return {
    source: source.source,
    imageryCanvas,
    centreElevationMetres: sampleHeight(0, 0),
    sampleHeight,
  };
};

export const loadNairobiTerrain = async (settings: GameSettings): Promise<RealTerrainData> => {
  const requested = sourceFor(settings.mapProvider, settings.mapToken);
  try {
    return await loadFromSource(requested);
  } catch (error) {
    if (requested.source === "open") throw error;
    return loadFromSource(sourceFor("open", ""));
  }
};
