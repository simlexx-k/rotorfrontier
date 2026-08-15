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

  const lod = await readFile("public/models/ah-64e-guardian-lod.glb");
  assert.equal(lod.toString("ascii", 0, 4), "glTF");
  const lodJsonLength = lod.readUInt32LE(12);
  const lodDocument = JSON.parse(lod.toString("utf8", 20, 20 + lodJsonLength));
  assert.equal(lodDocument.meshes.length, 250);
  assert.equal(lodDocument.materials.length, 32);
  assert.ok(lodDocument.meshes.some((mesh) => mesh.name.startsWith("mesh_640_")));
});
