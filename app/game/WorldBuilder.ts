import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import type { MissionDefinition, WeatherMode } from "./types";

export interface HelicopterVisual {
  root: TransformNode;
  rotor: TransformNode;
  tailRotor: TransformNode;
  shadowMeshes: Mesh[];
}

const hash = (x: number, z: number) => {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

export const terrainHeight = (x: number, z: number) => {
  const distanceToBase = Math.hypot(x, z - 120);
  const broad = Math.sin(x * 0.0014) * 54 + Math.cos(z * 0.0011) * 42;
  const ridges = Math.sin((x + z) * 0.0031) * 18 + Math.cos((x - z) * 0.0044) * 12;
  const mountains = Math.max(0, Math.sin(x * 0.00064 + 1.7) * Math.cos(z * 0.00072)) * 190;
  const natural = broad + ridges + mountains - 18;
  const baseBlend = Math.min(1, Math.max(0, (distanceToBase - 280) / 520));
  return natural * baseBlend;
};

const material = (scene: Scene, name: string, color: Color3, rough = 0.9) => {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = color;
  result.specularColor = Color3.White().scale(1 - rough);
  return result;
};

export function createHelicopter(
  scene: Scene,
  name: string,
  paint = new Color3(0.17, 0.25, 0.22),
): HelicopterVisual {
  const root = new TransformNode(`${name}-root`, scene);
  const fuselageMaterial = material(scene, `${name}-paint`, paint, 0.72);
  const darkMaterial = material(scene, `${name}-dark`, new Color3(0.025, 0.04, 0.04));
  const glassMaterial = material(scene, `${name}-glass`, new Color3(0.03, 0.12, 0.15), 0.2);
  glassMaterial.alpha = 0.78;
  const accentMaterial = material(scene, `${name}-accent`, new Color3(0.68, 0.86, 0.18));

  const fuselage = MeshBuilder.CreateSphere(`${name}-fuselage`, { diameter: 2, segments: 20 }, scene);
  fuselage.scaling.set(1.25, 0.82, 2.15);
  fuselage.material = fuselageMaterial;
  fuselage.parent = root;

  const cockpit = MeshBuilder.CreateSphere(`${name}-cockpit`, { diameter: 1.65, segments: 18, slice: 0.68 }, scene);
  cockpit.position.set(0, 0.15, 1.56);
  cockpit.scaling.set(1.03, 0.78, 1.18);
  cockpit.material = glassMaterial;
  cockpit.parent = root;

  const tail = MeshBuilder.CreateCylinder(
    `${name}-tail`,
    { height: 4.6, diameterTop: 0.18, diameterBottom: 0.58, tessellation: 10 },
    scene,
  );
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.25, -3.0);
  tail.material = fuselageMaterial;
  tail.parent = root;

  const fin = MeshBuilder.CreateBox(`${name}-fin`, { width: 0.12, height: 1.65, depth: 0.85 }, scene);
  fin.position.set(0, 0.98, -5.05);
  fin.rotation.x = -0.22;
  fin.material = fuselageMaterial;
  fin.parent = root;

  const rotor = new TransformNode(`${name}-rotor`, scene);
  rotor.position.y = 1.3;
  rotor.parent = root;
  for (let index = 0; index < 4; index += 1) {
    const blade = MeshBuilder.CreateBox(`${name}-blade-${index}`, { width: 0.16, height: 0.035, depth: 6.8 }, scene);
    blade.position.z = 3.1;
    blade.rotation.y = (Math.PI / 2) * index;
    blade.material = darkMaterial;
    blade.parent = rotor;
  }

  const hub = MeshBuilder.CreateCylinder(`${name}-hub`, { diameter: 0.34, height: 0.32, tessellation: 12 }, scene);
  hub.material = accentMaterial;
  hub.parent = rotor;

  const tailRotor = new TransformNode(`${name}-tail-rotor`, scene);
  tailRotor.position.set(0.32, 0.76, -5.2);
  tailRotor.rotation.z = Math.PI / 2;
  tailRotor.parent = root;
  for (let index = 0; index < 4; index += 1) {
    const blade = MeshBuilder.CreateBox(`${name}-tail-blade-${index}`, { width: 0.08, height: 0.035, depth: 1.35 }, scene);
    blade.position.z = 0.58;
    blade.rotation.y = (Math.PI / 2) * index;
    blade.material = darkMaterial;
    blade.parent = tailRotor;
  }

  for (const side of [-1, 1]) {
    const skid = MeshBuilder.CreateCylinder(`${name}-skid-${side}`, { height: 3.8, diameter: 0.09, tessellation: 8 }, scene);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.82, -1.02, 0.05);
    skid.material = darkMaterial;
    skid.parent = root;
    for (const z of [-1.05, 1.05]) {
      const strut = MeshBuilder.CreateCylinder(`${name}-strut-${side}-${z}`, { height: 1.15, diameter: 0.07, tessellation: 8 }, scene);
      strut.position.set(side * 0.62, -0.55, z);
      strut.rotation.z = side * -0.42;
      strut.material = darkMaterial;
      strut.parent = root;
    }
  }

  for (const side of [-1, 1]) {
    const pylon = MeshBuilder.CreateBox(`${name}-pylon-${side}`, { width: 2.4, height: 0.12, depth: 0.38 }, scene);
    pylon.position.set(side * 1.28, -0.12, 0.25);
    pylon.material = fuselageMaterial;
    pylon.parent = root;
  }

  return { root, rotor, tailRotor, shadowMeshes: [fuselage, cockpit, tail, fin] };
}

export class WorldBuilder {
  readonly sun: DirectionalLight;
  readonly ambient: HemisphericLight;
  readonly shadow: ShadowGenerator;
  readonly rain: ParticleSystem;
  weather: WeatherMode;
  timeOfDay: number;
  private elapsed = 0;
  private readonly skyMaterial: StandardMaterial;
  private readonly windVector = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly mission: MissionDefinition,
    highQuality: boolean,
  ) {
    this.weather = mission.weather;
    this.timeOfDay = mission.timeOfDay;
    scene.clearColor = new Color4(0.05, 0.09, 0.11, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.00022;
    scene.fogColor = new Color3(0.28, 0.38, 0.39);

    this.ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
    this.ambient.intensity = 0.62;
    this.ambient.groundColor = new Color3(0.08, 0.1, 0.08);
    this.sun = new DirectionalLight("sun", new Vector3(-0.4, -0.8, 0.25), scene);
    this.sun.position.set(900, 1600, -900);
    this.sun.intensity = 2.2;
    this.shadow = new ShadowGenerator(highQuality ? 2048 : 1024, this.sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.bias = 0.0006;

    this.skyMaterial = material(scene, "sky-material", new Color3(0.14, 0.28, 0.36));
    this.skyMaterial.backFaceCulling = false;
    this.skyMaterial.disableLighting = true;
    this.skyMaterial.emissiveColor = this.skyMaterial.diffuseColor;
    const sky = MeshBuilder.CreateSphere("sky", { diameter: 14000, segments: 18, sideOrientation: Mesh.BACKSIDE }, scene);
    sky.material = this.skyMaterial;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    this.createTerrain(highQuality ? 112 : 78);
    this.createWater();
    this.createVegetation(highQuality ? 620 : 260);
    this.createOutposts();
    this.createBeacon();
    this.rain = this.createRain();
    this.applyEnvironment();
  }

  get wind() { return this.windVector; }

  update(delta: number, playerPosition: Vector3) {
    this.elapsed += delta;
    this.timeOfDay = (this.timeOfDay + delta * 0.006) % 24;
    const gust = this.weather === "storm" ? 8 + Math.sin(this.elapsed * 0.43) * 5 : this.weather === "haze" ? 2.8 : 1.4;
    this.windVector.set(
      Math.sin(this.elapsed * 0.08) * gust,
      Math.sin(this.elapsed * 0.31) * gust * 0.08,
      Math.cos(this.elapsed * 0.067) * gust,
    );
    this.rain.emitter = playerPosition.add(new Vector3(0, 35, 0));
    this.updateLighting();
  }

  private createTerrain(segments: number) {
    const size = 8200;
    const positions: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
      for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
        const x = (xIndex / segments - 0.5) * size;
        const z = (zIndex / segments - 0.5) * size;
        const y = terrainHeight(x, z);
        positions.push(x, y, z);
        const altitude = Math.max(0, Math.min(1, (y + 40) / 260));
        const variation = hash(xIndex, zIndex) * 0.06;
        colors.push(0.16 + altitude * 0.21 + variation, 0.24 + altitude * 0.17 + variation, 0.13 + altitude * 0.13, 1);
      }
    }
    for (let zIndex = 0; zIndex < segments; zIndex += 1) {
      for (let xIndex = 0; xIndex < segments; xIndex += 1) {
        const current = zIndex * (segments + 1) + xIndex;
        const next = current + segments + 1;
        indices.push(current, next, current + 1, current + 1, next, next + 1);
      }
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const terrain = new Mesh("terrain", this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = colors;
    data.applyToMesh(terrain);
    const terrainMaterial = material(this.scene, "terrain-material", new Color3(0.43, 0.55, 0.37));
    terrainMaterial.specularColor = Color3.Black();
    terrain.material = terrainMaterial;
    terrain.receiveShadows = true;
    terrain.freezeWorldMatrix();
  }

  private createWater() {
    const waterMaterial = material(this.scene, "water-material", new Color3(0.025, 0.15, 0.19), 0.2);
    waterMaterial.alpha = 0.88;
    waterMaterial.specularPower = 96;
    const river = MeshBuilder.CreateGround("river", { width: 560, height: 8200, subdivisions: 2 }, this.scene);
    river.position.x = 1260;
    river.position.y = -24;
    river.rotation.y = -0.18;
    river.material = waterMaterial;
    river.receiveShadows = true;
  }

  private createVegetation(count: number) {
    const treeMaterial = material(this.scene, "forest-material", new Color3(0.08, 0.19, 0.11));
    const tree = MeshBuilder.CreateCylinder("tree-source", { height: 22, diameterTop: 0.2, diameterBottom: 7.5, tessellation: 7 }, this.scene);
    tree.material = treeMaterial;
    tree.isPickable = false;
    const matrices = new Float32Array(count * 16);
    let created = 0;
    for (let index = 0; index < count * 2 && created < count; index += 1) {
      const x = (hash(index, 2) - 0.5) * 7200;
      const z = (hash(index, 9) - 0.5) * 7200;
      if (Math.hypot(x, z - 120) < 480 || Math.abs(x - 1260) < 390) continue;
      const scale = 0.62 + hash(index, 12) * 1.25;
      const matrix = Matrix.Compose(
        new Vector3(scale, scale, scale),
        Quaternion.Identity(),
        new Vector3(x, terrainHeight(x, z) + 9 * scale, z),
      );
      matrix.copyToArray(matrices, created * 16);
      created += 1;
    }
    tree.thinInstanceSetBuffer("matrix", matrices.slice(0, created * 16), 16);
    tree.freezeWorldMatrix();
  }

  private createOutposts() {
    const concrete = material(this.scene, "concrete", new Color3(0.27, 0.3, 0.28));
    const roof = material(this.scene, "roof", new Color3(0.12, 0.15, 0.14));
    const points = [new Vector3(-1550, 0, -1280), new Vector3(1760, 0, 920), new Vector3(-720, 0, 2440)];
    points.forEach((point, cluster) => {
      for (let index = 0; index < 12; index += 1) {
        const x = point.x + (hash(index, cluster * 7) - 0.5) * 310;
        const z = point.z + (hash(index, cluster * 11 + 2) - 0.5) * 310;
        const height = 12 + hash(index, cluster + 30) * 34;
        const building = MeshBuilder.CreateBox(`building-${cluster}-${index}`, {
          width: 18 + hash(index, 40) * 28,
          depth: 18 + hash(index, 50) * 30,
          height,
        }, this.scene);
        building.position.set(x, terrainHeight(x, z) + height / 2, z);
        building.material = index % 3 === 0 ? roof : concrete;
        building.receiveShadows = true;
        this.shadow.addShadowCaster(building);
      }
    });

    const padMaterial = material(this.scene, "helipad-material", new Color3(0.16, 0.18, 0.17));
    const pad = MeshBuilder.CreateCylinder("helipad", { diameter: 62, height: 1.2, tessellation: 48 }, this.scene);
    pad.position.set(0, terrainHeight(0, 120) + 0.2, 120);
    pad.material = padMaterial;
    pad.receiveShadows = true;
  }

  private createBeacon() {
    const positions: Record<string, Vector3> = {
      "first-light": new Vector3(-1650, 0, -1430),
      "broken-spear": new Vector3(1820, 0, 1020),
      "silent-river": new Vector3(1240, 0, 2660),
    };
    const point = positions[this.mission.id];
    point.y = terrainHeight(point.x, point.z) + 38;
    const beaconMaterial = material(this.scene, "beacon-material", new Color3(0.55, 0.9, 0.22));
    beaconMaterial.emissiveColor = new Color3(0.4, 0.9, 0.12);
    beaconMaterial.alpha = 0.72;
    const beacon = MeshBuilder.CreateTorus("mission-beacon", { diameter: 48, thickness: 1.2, tessellation: 64 }, this.scene);
    beacon.position.copyFrom(point);
    beacon.rotation.x = Math.PI / 2;
    beacon.material = beaconMaterial;
    const beam = MeshBuilder.CreateCylinder("mission-beam", { diameter: 2.2, height: 230, tessellation: 12 }, this.scene);
    beam.position.copyFrom(point.add(new Vector3(0, 90, 0)));
    beam.material = beaconMaterial;
  }

  private createRain() {
    const texture = new DynamicTexture("rain-texture", { width: 8, height: 32 }, this.scene, false);
    const context = texture.getContext();
    const gradient = context.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, "rgba(190,225,235,0)");
    gradient.addColorStop(0.5, "rgba(190,225,235,0.8)");
    gradient.addColorStop(1, "rgba(190,225,235,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 8, 32);
    texture.update();
    const rain = new ParticleSystem("rain", 2600, this.scene);
    rain.particleTexture = texture;
    rain.minEmitBox = new Vector3(-70, 0, -70);
    rain.maxEmitBox = new Vector3(70, 0, 70);
    rain.direction1 = new Vector3(-2, -58, -1);
    rain.direction2 = new Vector3(2, -74, 1);
    rain.minSize = 0.05;
    rain.maxSize = 0.12;
    rain.minLifeTime = 0.65;
    rain.maxLifeTime = 1.4;
    rain.emitRate = 0;
    rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    rain.start();
    return rain;
  }

  private applyEnvironment() {
    this.rain.emitRate = this.weather === "storm" ? 1600 : 0;
    this.scene.fogDensity = this.weather === "storm" ? 0.00052 : this.weather === "haze" ? 0.00034 : 0.00017;
    this.updateLighting();
  }

  private updateLighting() {
    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const daylight = Math.max(0.04, Math.min(1, elevation * 1.5 + 0.2));
    this.sun.direction.set(Math.cos(angle) * -0.6, -Math.max(0.08, elevation), 0.28);
    this.sun.intensity = daylight * (this.weather === "storm" ? 0.55 : 2.3);
    this.ambient.intensity = 0.14 + daylight * (this.weather === "storm" ? 0.3 : 0.55);
    const day = new Color3(0.16, 0.37, 0.52);
    const dusk = new Color3(0.46, 0.18, 0.1);
    const night = new Color3(0.008, 0.018, 0.045);
    const sky = daylight < 0.2 ? Color3.Lerp(night, dusk, daylight * 5) : Color3.Lerp(dusk, day, (daylight - 0.2) / 0.8);
    if (this.weather === "storm") sky.scaleInPlace(0.36);
    this.skyMaterial.diffuseColor.copyFrom(sky);
    this.skyMaterial.emissiveColor.copyFrom(sky);
    this.scene.clearColor.set(sky.r, sky.g, sky.b, 1);
    this.scene.fogColor.copyFrom(sky.scale(0.76));
  }
}
