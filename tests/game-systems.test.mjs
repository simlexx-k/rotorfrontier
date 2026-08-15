import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core";
import {
  applyMissionResult,
  DEFAULT_CAREER,
  purchaseUpgrade,
  upgradeCost,
} from "../app/game/CareerStore.ts";
import { ACTIVE_AIRCRAFT, DEFAULT_SETTINGS, MISSIONS } from "../app/game/config.ts";
import { FlightModel } from "../app/game/FlightModel.ts";
import { MissionDirector } from "../app/game/MissionDirector.ts";
import {
  decodeTerrainRgbHeight,
  decodeTerrariumHeight,
  latitudeLongitudeToTile,
  metresPerPixelAtLatitude,
  NAIROBI_THEATRE,
} from "../app/game/RealTerrain.ts";

test("AH-64E dossier retains sourced specifications and attribution", () => {
  assert.equal(ACTIVE_AIRCRAFT.designation, "AH-64E");
  assert.equal(ACTIVE_AIRCRAFT.dimensions.rotorDiameterMetres, 14.6);
  assert.equal(ACTIVE_AIRCRAFT.performance.maximumSpeedKnots, 164);
  assert.equal(ACTIVE_AIRCRAFT.propulsion.model, "T700-GE-701D");
  assert.equal(ACTIVE_AIRCRAFT.modelCredit.license, "CC BY 4.0");
  assert.match(ACTIVE_AIRCRAFT.modelCredit.href, /sketchfab\.com/);
});

test("default operation launches in clear daylight", () => {
  assert.equal(MISSIONS[0].weather, "clear");
  assert.ok(MISSIONS[0].timeOfDay >= 10 && MISSIONS[0].timeOfDay <= 15);
});

test("Nairobi real terrain is the token-free default and decodes provider elevations", () => {
  assert.equal(DEFAULT_SETTINGS.realTerrain, true);
  assert.equal(DEFAULT_SETTINGS.mapProvider, "open");
  assert.equal(DEFAULT_SETTINGS.mapToken, "");
  assert.equal(NAIROBI_THEATRE.latitude, -1.286389);
  assert.equal(NAIROBI_THEATRE.longitude, 36.817223);

  const tile = latitudeLongitudeToTile(
    NAIROBI_THEATRE.latitude,
    NAIROBI_THEATRE.longitude,
    NAIROBI_THEATRE.zoom,
  );
  assert.equal(Math.floor(tile.x), 4933);
  assert.equal(Math.floor(tile.y), 4125);
  assert.ok(
    Math.abs(
      metresPerPixelAtLatitude(NAIROBI_THEATRE.latitude, NAIROBI_THEATRE.zoom) -
        19.1044409775,
    ) < 0.000_001,
  );
  assert.equal(decodeTerrariumHeight(137, 219, 68), 2523.265625);
  assert.ok(Math.abs(decodeTerrainRgbHeight(1, 150, 136) - 407.2) < 0.000_001);
});

test("career upgrades are immutable and deduct the documented cost", () => {
  const upgraded = purchaseUpgrade(DEFAULT_CAREER, "engine");
  assert.ok(upgraded);
  assert.equal(upgraded.upgrades.engine, 1);
  assert.equal(upgraded.credits, DEFAULT_CAREER.credits - upgradeCost(0));
  assert.equal(DEFAULT_CAREER.upgrades.engine, 0);
});

test("mission results update persistent career progress", () => {
  const profile = applyMissionResult(DEFAULT_CAREER, {
    success: true,
    missionId: "first-light",
    score: 11_200,
    kills: 4,
    credits: 2_400,
    xp: 2_600,
    flightTime: 420,
    rating: "S",
  });
  assert.equal(profile.level, 2);
  assert.deepEqual(profile.completedMissions, ["first-light"]);
  assert.equal(profile.statistics.victories, 1);
  assert.equal(profile.statistics.kills, 4);
  assert.equal(profile.statistics.bestScore, 11_200);
});

test("recon mission advances after holding each waypoint", () => {
  const director = new MissionDirector(MISSIONS[0]);
  const signals = {
    playerPosition: new Vector3(-1650, 50, -1430),
    speed: 0,
    radarAltitude: 20,
    destroyedAir: 0,
    destroyedGround: 0,
    remainingEnemies: 3,
  };
  director.update(3.6, signals);
  let state = director.update(0, signals);
  assert.match(state.objective, /ridge relay/i);
  signals.playerPosition.set(-720, 50, 2440);
  director.update(3.6, signals);
  state = director.update(0, signals);
  assert.match(state.objective, /return/i);
  signals.playerPosition.set(0, 20, 120);
  state = director.update(1.6, signals);
  assert.equal(state.completed, true);
  assert.equal(state.progress, 1);
});

test("hard landings cause component damage", () => {
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, 1, 0);
  model.velocity.set(0, -12, 0);
  const result = model.step(1 / 60, {
    pitch: 0,
    roll: 0,
    yaw: 0,
    collective: 0,
    lookX: 0,
    lookY: 0,
    firePrimary: false,
    fireSecondary: false,
    device: "keyboard-mouse",
  }, 0, Vector3.Zero());
  assert.equal(result.hardLanding, true);
  assert.ok(model.hull < 100);
});
