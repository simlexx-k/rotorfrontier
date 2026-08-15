import "@babylonjs/loaders/glTF/index.js";

import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createHelicopter as createFallbackHelicopter } from "./WorldBuilder";
import type { HelicopterVisual } from "./WorldBuilder";

const APACHE_MODEL_PATH = "/models/ah-64e-guardian.glb";
const APACHE_ROTOR_DIAMETER_METRES = 14.6;
const APACHE_SOURCE_TO_FORWARD_YAW = -Math.PI / 2;
const APACHE_MAIN_ROTOR_MESH_PREFIXES = [
  "mesh_639_",
  "mesh_640_",
  "mesh_647_",
  "mesh_658_",
] as const;

const createRotorMaterial = (
  scene: Scene,
  name: string,
  color: Color3,
  alpha: number,
) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.2);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
};

const addRotorWashVisuals = (
  scene: Scene,
  root: TransformNode,
  name: string,
) => {
  const rotor = new TransformNode(`${name}-main-rotor-motion`, scene);
  rotor.position.set(0, 2.62, 1.3);
  rotor.parent = root;

  const rotorMaterial = createRotorMaterial(
    scene,
    `${name}-main-rotor-blur-material`,
    new Color3(0.16, 0.18, 0.17),
    0.12,
  );
  const rotorDisc = MeshBuilder.CreateCylinder(
    `${name}-main-rotor-blur`,
    {
      diameter: APACHE_ROTOR_DIAMETER_METRES,
      height: 0.018,
      tessellation: 96,
    },
    scene,
  );
  rotorDisc.material = rotorMaterial;
  rotorDisc.isPickable = false;
  rotorDisc.parent = rotor;

  const tipMaterial = createRotorMaterial(
    scene,
    `${name}-rotor-tip-material`,
    new Color3(0.82, 0.66, 0.16),
    0.28,
  );
  const tipRing = MeshBuilder.CreateTorus(
    `${name}-rotor-tip-ring`,
    { diameter: 14.25, thickness: 0.025, tessellation: 96 },
    scene,
  );
  tipRing.material = tipMaterial;
  tipRing.isPickable = false;
  tipRing.parent = rotor;

  const tailRotor = new TransformNode(`${name}-tail-rotor-motion`, scene);
  tailRotor.position.set(-1.68, 0.65, -7.23);
  tailRotor.rotation.z = Math.PI / 2;
  tailRotor.parent = root;

  const tailDisc = MeshBuilder.CreateCylinder(
    `${name}-tail-rotor-blur`,
    { diameter: 2.65, height: 0.012, tessellation: 64 },
    scene,
  );
  tailDisc.material = rotorMaterial;
  tailDisc.isPickable = false;
  tailDisc.parent = tailRotor;

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
): Promise<HelicopterVisual> => {
  const imported = await SceneLoader.ImportMeshAsync(null, "", APACHE_MODEL_PATH, scene);
  const root = new TransformNode(`${name}-root`, scene);
  const modelMount = new TransformNode(`${name}-model-mount`, scene);
  const centerMount = new TransformNode(`${name}-center-mount`, scene);
  modelMount.parent = root;
  centerMount.parent = modelMount;

  const modelRoot = imported.meshes[0];
  const { minimum, maximum } = measureMeshes(imported.meshes);
  const size = maximum.subtract(minimum);
  const center = minimum.add(maximum).scale(0.5);
  // The source airframe is longitudinal on +X and its rotor spans Z. Normalize
  // the latter to Boeing's published diameter, then yaw the nose toward game +Z.
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

  const { rotor, tailRotor } = addRotorWashVisuals(scene, root, name);
  const mainRotorBlades = imported.meshes.filter(
    (mesh): mesh is Mesh =>
      mesh instanceof Mesh &&
      APACHE_MAIN_ROTOR_MESH_PREFIXES.some((prefix) => mesh.name.startsWith(prefix)),
  );
  for (const blade of mainRotorBlades) blade.setParent(rotor, true);

  const shadowRoot = modelRoot instanceof Mesh ? [modelRoot] : imported.meshes.filter((mesh) => mesh instanceof Mesh).slice(0, 1);

  return {
    root,
    rotor,
    tailRotor,
    shadowMeshes: [...shadowRoot, ...mainRotorBlades],
  };
};

export async function createPlayerHelicopter(
  scene: Scene,
  name: string,
  highDetail: boolean,
): Promise<HelicopterVisual> {
  if (!highDetail) return createFallbackHelicopter(scene, name);
  try {
    return await createDetailedApache(scene, name);
  } catch {
    return createFallbackHelicopter(scene, name);
  }
}
