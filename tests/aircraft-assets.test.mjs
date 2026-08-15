import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("optimized AH-64E model and attribution ship together", async () => {
  const model = await stat("public/models/ah-64e-guardian.glb");
  const performanceModel = await stat("public/models/ah-64e-guardian-lod.glb");
  const attribution = await stat("docs/ASSET_LICENSES.md");

  assert.ok(model.size > 1_000_000, "model should contain the detailed airframe");
  assert.ok(model.size < 20_000_000, "model should stay within the web delivery budget");
  assert.ok(performanceModel.size > 1_000_000, "performance LOD should retain the detailed airframe");
  assert.ok(performanceModel.size < 8_000_000, "performance LOD should fit its delivery budget");
  assert.ok(attribution.size > 0, "the required attribution must ship with the model");

  const glb = await readFile("public/models/ah-64e-guardian.glb");
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2, "asset should use glTF 2.0");
  const jsonLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
  assert.equal(document.meshes.length, 251);
  assert.equal(document.materials.length, 32);
  assert.ok(document.extensionsRequired.includes("EXT_texture_webp"));
  assert.ok(document.meshes.some((mesh) => mesh.name.startsWith("mesh_640_")));
  assert.ok(document.meshes.some((mesh) => mesh.name.startsWith("mesh_449_")));

  const lod = await readFile("public/models/ah-64e-guardian-lod.glb");
  assert.equal(lod.toString("ascii", 0, 4), "glTF");
  const lodJsonLength = lod.readUInt32LE(12);
  const lodDocument = JSON.parse(lod.toString("utf8", 20, 20 + lodJsonLength));
  assert.equal(lodDocument.meshes.length, 250);
  assert.equal(lodDocument.materials.length, 32);
  assert.ok(lodDocument.meshes.some((mesh) => mesh.name.startsWith("mesh_640_")));
  assert.ok(lodDocument.meshes.some((mesh) => mesh.name.startsWith("mesh_449_")));
});

test("Apache orientation and real blade animation replace rotor discs", async () => {
  const source = await readFile("app/game/AircraftFactory.ts", "utf8");
  assert.match(source, /APACHE_SOURCE_TO_FORWARD_YAW = Math\.PI \/ 2/);
  assert.match(source, /mesh_639_/);
  assert.match(source, /mesh_449_/);
  assert.doesNotMatch(source, /main-rotor-blur/);
  assert.doesNotMatch(source, /rotor-tip-ring/);
  assert.doesNotMatch(source, /tail-rotor-blur/);
});

test("licensed sampled helicopter and weapon audio ships with attribution", async () => {
  const rotor = await stat("public/audio/ah64-rotor-loop.mp3");
  const cannon = await stat("public/audio/m230-cannon.mp3");
  const rocket = await stat("public/audio/rocket-launch.mp3");
  assert.ok(rotor.size > 70_000 && rotor.size < 150_000);
  assert.ok(cannon.size > 8_000 && cannon.size < 30_000);
  assert.ok(rocket.size > 40_000 && rocket.size < 100_000);

  const attribution = await readFile("docs/ASSET_LICENSES.md", "utf8");
  assert.match(attribution, /Helicopter Rotor Loop/i);
  assert.match(attribution, /A collection of gun sounds/i);
  assert.match(attribution, /Rocket launch/i);
  assert.match(attribution, /CC BY 3\.0/);
  assert.match(attribution, /CC0/);
});

test("weapon effects and helicopter takedown visuals ship in the combat runtime", async () => {
  const combat = await readFile("app/game/CombatSystem.ts", "utf8");
  const ai = await readFile("app/game/AISystem.ts", "utf8");

  assert.match(combat, /Quaternion\.FromLookDirectionLH/);
  assert.match(combat, /spawnExhaust/);
  assert.match(combat, /CreateTorus/);
  assert.match(combat, /explosion-shockwave/);
  assert.match(ai, /updateDestroyed/);
  assert.match(ai, /wreck impact|onCrash/);
});
