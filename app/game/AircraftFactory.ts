import "@babylonjs/loaders/glTF/index.js";

import {
  AbstractMesh,
  Mesh,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createHelicopter as createFallbackHelicopter } from "./WorldBuilder";
import type { HelicopterVisual } from "./WorldBuilder";

const APACHE_MODEL_PATH = "/models/ah-64e-guardian.glb";
const APACHE_LOD_MODEL_PATH = "/models/ah-64e-guardian-lod.glb";
const APACHE_ROTOR_DIAMETER_METRES = 14.6;
const APACHE_SOURCE_TO_FORWARD_YAW = Math.PI / 2;
const APACHE_MAIN_ROTOR_MESH_PREFIXES = [
  "mesh_639_",
  "mesh_640_",
  "mesh_647_",
  "mesh_658_",
] as const;
const APACHE_TAIL_ROTOR_MESH_PREFIXES = [
  "mesh_449_",
  "mesh_494_",
  "mesh_556_",
  "mesh_577_",
] as const;

export type PlayerHelicopterVisual = HelicopterVisual & {
  assetTier: "high" | "low" | "procedural";
};

const addRotorMotion = (
  scene: Scene,
  root: TransformNode,
  name: string,
  mainRotorBlades: Mesh[],
  tailRotorBlades: Mesh[],
) => {
  const mainBounds = measureMeshes(mainRotorBlades);
  const mainHub = mainBounds.minimum.add(mainBounds.maximum).scale(0.5);
  const rotor = new TransformNode(`${name}-main-rotor-motion`, scene);
  rotor.position.copyFrom(mainHub);
  rotor.parent = root;
  for (const blade of mainRotorBlades) blade.setParent(rotor, true);

  const tailBounds = measureMeshes(tailRotorBlades);
  const tailHub = tailBounds.minimum.add(tailBounds.maximum).scale(0.5);
  const tailMount = new TransformNode(`${name}-tail-rotor-mount`, scene);
  tailMount.position.copyFrom(tailHub);
  tailMount.rotation.z = -Math.PI / 2;
  tailMount.parent = root;
  const tailRotor = new TransformNode(`${name}-tail-rotor-motion`, scene);
  tailRotor.parent = tailMount;
  for (const blade of tailRotorBlades) blade.setParent(tailRotor, true);

  return { rotor, tailRotor };
};

const measureMeshes = (meshes: AbstractMesh[]) => {
  const minimum = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const maximum = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const mesh of meshes) {
    if (mesh.getTotalVertices() === 0) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(bounds.minimumWorld);
    maximum.maximizeInPlace(bounds.maximumWorld);
  }

  return { minimum, maximum };
};

const createDetailedApache = async (
  scene: Scene,
  name: string,
  highDetail: boolean,
): Promise<PlayerHelicopterVisual> => {
  const modelPath = highDetail ? APACHE_MODEL_PATH : APACHE_LOD_MODEL_PATH;
  const imported = await SceneLoader.ImportMeshAsync(null, "", modelPath, scene);
  const root = new TransformNode(`${name}-root`, scene);
  const modelMount = new TransformNode(`${name}-model-mount`, scene);
  const centerMount = new TransformNode(`${name}-center-mount`, scene);
  modelMount.parent = root;
  centerMount.parent = modelMount;

  const modelRoot = imported.meshes[0];
  const { minimum, maximum } = measureMeshes(imported.meshes);
  const size = maximum.subtract(minimum);
  const center = minimum.add(maximum).scale(0.5);
  // After Babylon's glTF handedness conversion the source nose faces -X and the
  // main rotor spans Z. Normalize that span to Boeing's published diameter, then
  // yaw the nose toward the simulation's +Z forward axis.
  const scale = APACHE_ROTOR_DIAMETER_METRES / size.z;

  modelRoot.parent = centerMount;
  centerMount.position.copyFrom(center).scaleInPlace(-1);
  modelMount.scaling.setAll(scale);
  modelMount.rotation.y = APACHE_SOURCE_TO_FORWARD_YAW;
  modelMount.position.y = size.y * scale * 0.5 - 1.15;

  for (const mesh of imported.meshes) {
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = false;
  }

  const mainRotorBlades = imported.meshes.filter(
    (mesh): mesh is Mesh =>
      mesh instanceof Mesh &&
      APACHE_MAIN_ROTOR_MESH_PREFIXES.some((prefix) => mesh.name.startsWith(prefix)),
  );
  const tailRotorBlades = imported.meshes.filter(
    (mesh): mesh is Mesh =>
      mesh instanceof Mesh &&
      APACHE_TAIL_ROTOR_MESH_PREFIXES.some((prefix) => mesh.name.startsWith(prefix)),
  );
  if (mainRotorBlades.length !== 4 || tailRotorBlades.length !== 4) {
    throw new Error("AH-64E rotor blade set is incomplete");
  }
  const { rotor, tailRotor } = addRotorMotion(
    scene,
    root,
    name,
    mainRotorBlades,
    tailRotorBlades,
  );

  const shadowRoot = modelRoot instanceof Mesh ? [modelRoot] : imported.meshes.filter((mesh) => mesh instanceof Mesh).slice(0, 1);

  return {
    root,
    rotor,
    tailRotor,
    shadowMeshes: [...shadowRoot, ...mainRotorBlades, ...tailRotorBlades],
    assetTier: highDetail ? "high" : "low",
  };
};

export async function createPlayerHelicopter(
  scene: Scene,
  name: string,
  highDetail: boolean,
): Promise<PlayerHelicopterVisual> {
  try {
    return await createDetailedApache(scene, name, highDetail);
  } catch {
    if (highDetail) {
      try {
        return await createDetailedApache(scene, name, false);
      } catch {
        // Fall through to the always-available safety airframe.
      }
    }
    return {
      ...createFallbackHelicopter(scene, name),
      assetTier: "procedural",
    };
  }
}
