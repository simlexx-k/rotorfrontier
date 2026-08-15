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
import {
  FLIGHT_GROUND_CLEARANCE_METRES,
  FlightModel,
} from "../app/game/FlightModel.ts";
import {
  mapDeviceCyclic,
  mapDigitalCollective,
  mapDigitalCyclic,
  mapGamepadYaw,
} from "../app/game/InputManager.ts";
import { MissionDirector } from "../app/game/MissionDirector.ts";
import {
  decodeTerrainRgbHeight,
  decodeTerrariumHeight,
  latitudeLongitudeToTile,
  metresPerPixelAtLatitude,
  NAIROBI_THEATRE,
} from "../app/game/RealTerrain.ts";

const controls = (overrides = {}) => ({
  pitch: 0,
  roll: 0,
  yaw: 0,
  collective: 0,
  lookX: 0,
  lookY: 0,
  firePrimary: false,
  fireSecondary: false,
  device: "keyboard-mouse",
  ...overrides,
});

const simulate = (model, seconds, frame, ground = 1_700) => {
  for (let step = 0; step < seconds * 60; step += 1) {
    model.step(1 / 60, frame, ground, Vector3.Zero());
  }
};

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

test("keyboard, mouse and gamepad cyclic axes map to aircraft-relative motion", () => {
  assert.deepEqual(mapDigitalCyclic(true, false, false, false), { pitch: 1, roll: 0 });
  assert.deepEqual(mapDigitalCyclic(false, true, false, false), { pitch: -1, roll: 0 });
  assert.deepEqual(mapDigitalCyclic(false, false, false, true), { pitch: 0, roll: -1 });
  assert.deepEqual(mapDeviceCyclic(0.8, -0.6, false), { pitch: 0.6, roll: -0.8 });
  assert.deepEqual(mapDeviceCyclic(0.8, -0.6, true), { pitch: -0.6, roll: -0.8 });
  assert.equal(mapDigitalCollective(true, false), 1);
  assert.equal(mapDigitalCollective(false, true), -1);
  assert.equal(mapDigitalCollective(true, true), 0);
  assert.equal(mapGamepadYaw({ pressed: false, value: 0.08 }, { pressed: false, value: 0.12 }), 0);
  assert.equal(mapGamepadYaw({ pressed: true, value: 1 }, { pressed: false, value: 0 }), -1);
  assert.equal(mapGamepadYaw({ pressed: false, value: 0 }, { pressed: true, value: 1 }), 1);
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

test("aircraft starts settled on Nairobi ground without sinking or taking damage", () => {
  const ground = 1_700;
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, ground + FLIGHT_GROUND_CLEARANCE_METRES, 120);
  simulate(model, 5, controls(), ground);
  assert.ok(
    model.position.y >= ground + FLIGHT_GROUND_CLEARANCE_METRES,
    "skids must remain above terrain",
  );
  assert.ok(Math.abs(model.velocity.y) < 0.001, "neutral aircraft should remain settled");
  assert.equal(model.hull, 100);
  assert.equal(model.engine, 100);
});

test("hold-to-ascend lifts from Nairobi elevation and release captures a hover", () => {
  const ground = 1_700;
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, ground + FLIGHT_GROUND_CLEARANCE_METRES, 120);
  simulate(model, 0.5, controls({ collective: 1 }), ground);
  simulate(model, 3, controls(), ground);
  assert.ok(
    model.position.y > ground + FLIGHT_GROUND_CLEARANCE_METRES + 2.5,
    "holding Space or RT should produce a prompt positive climb",
  );
  assert.ok(Math.abs(model.velocity.y) < 0.35, "releasing ascend should capture a hover");
});

test("assisted cyclic produces forward, backward and right translation", () => {
  const ground = 1_700;
  const createAirborne = () => {
    const model = new FlightModel(DEFAULT_SETTINGS);
    model.position.set(0, ground + 12, 120);
    model.collective = 0.64;
    model.rotorRpm = 1;
    model.step(1 / 60, controls(), ground, Vector3.Zero());
    return model;
  };

  const forwardModel = createAirborne();
  const forwardStart = forwardModel.position.clone();
  const forward = Vector3.Forward().applyRotationQuaternion(forwardModel.rotation);
  simulate(forwardModel, 2, controls(mapDigitalCyclic(true, false, false, false)), ground);
  assert.ok(Vector3.Dot(forwardModel.position.subtract(forwardStart), forward) > 4);

  const backwardModel = createAirborne();
  const backwardStart = backwardModel.position.clone();
  const backward = Vector3.Forward().applyRotationQuaternion(backwardModel.rotation);
  simulate(backwardModel, 2, controls(mapDigitalCyclic(false, true, false, false)), ground);
  assert.ok(Vector3.Dot(backwardModel.position.subtract(backwardStart), backward) < -4);

  const rightModel = createAirborne();
  const rightStart = rightModel.position.clone();
  const right = Vector3.Right().applyRotationQuaternion(rightModel.rotation);
  simulate(rightModel, 2, controls(mapDigitalCyclic(false, false, false, true)), ground);
  assert.ok(Vector3.Dot(rightModel.position.subtract(rightStart), right) > 4);
});

test("arcade assist automatically levels and brakes after movement input", () => {
  const ground = 1_700;
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, ground + 20, 120);
  simulate(model, 2, controls({ pitch: 1 }), ground);
  const commandedSpeed = Math.hypot(model.velocity.x, model.velocity.z);
  simulate(model, 2, controls(), ground);
  const releasedSpeed = Math.hypot(model.velocity.x, model.velocity.z);

  assert.ok(commandedSpeed > 20, "forward input should build useful mission speed");
  assert.ok(releasedSpeed < commandedSpeed * 0.2, "neutral input should brake horizontal motion");
  assert.ok(Math.abs(model.pitch) < 0.02, "neutral input should return the aircraft to level");
});

test("released yaw settles completely instead of revolving indefinitely", () => {
  const ground = 1_700;
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, ground + 20, 120);
  simulate(model, 0.8, controls({ yaw: 1 }), ground);
  simulate(model, 2, controls(), ground);

  const settledYaw = model.yaw;
  assert.equal(model.yawRate, 0, "neutral pedals should reach a true stopped state");
  simulate(model, 2, controls(), ground);
  assert.equal(model.yaw, settledYaw, "heading must remain fixed after the turn is released");
});

test("advanced mode retains persistent collective authority", () => {
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.hoverAssist = false;
  const initialCollective = model.collective;
  simulate(model, 0.5, controls({ collective: 1 }), 0);
  const raisedCollective = model.collective;
  simulate(model, 1, controls(), 0);

  assert.ok(raisedCollective > initialCollective + 0.2);
  assert.ok(Math.abs(model.collective - raisedCollective) < 0.000_001);
});

test("terrain sampler prevents penetration while crossing rising ground", () => {
  const terrain = (x) => 1_700 + Math.max(0, x) * 1.25;
  const model = new FlightModel(DEFAULT_SETTINGS);
  model.position.set(0, terrain(0) + 28, 0);
  model.velocity.set(42, -34, 0);
  model.collective = 0.08;

  for (let step = 0; step < 180; step += 1) {
    model.step(1 / 60, controls(), terrain, Vector3.Zero());
    assert.ok(
      model.position.y >=
        terrain(model.position.x) + FLIGHT_GROUND_CLEARANCE_METRES - 0.000_001,
      "aircraft root must never cross the terrain surface",
    );
  }
});
