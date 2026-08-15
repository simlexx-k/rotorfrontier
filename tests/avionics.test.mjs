import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "@babylonjs/core";
import {
  classifyFlightMode,
  courseFromVelocity,
  FlightDataComputer,
  waypointSolution,
} from "../app/game/FlightDataComputer.ts";
import {
  hasTerrainLineOfSight,
  segmentSphereHit,
  solveInterceptPoint,
  TargetTracker,
} from "../app/game/TargetTracker.ts";

const target = (overrides = {}) => ({
  id: "armour-1",
  name: "COLUMN 1",
  kind: "armour",
  position: new Vector3(0, 100, -500),
  velocity: new Vector3(0, 0, 50),
  health: 85,
  maxHealth: 85,
  alive: true,
  radius: 4.8,
  applyDamage() {},
  ...overrides,
});

test("swept projectile collision catches a target crossed between fixed steps", () => {
  const collision = segmentSphereHit(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, -100),
    new Vector3(0, 0, -50),
    2,
  );
  assert.equal(collision.hit, true);
  assert.ok(Math.abs(collision.point.z + 50) < 0.000_001);
  assert.equal(collision.amount, 0.5);
});

test("intercept solver produces a forward lead for a moving target", () => {
  const solution = solveInterceptPoint(
    Vector3.Zero(),
    100,
    new Vector3(0, 0, -100),
    new Vector3(12, 0, 0),
  );
  assert.ok(solution.time > 1 && solution.time < 1.02);
  assert.ok(solution.point.x > 12);
  assert.equal(solution.point.z, -100);
});

test("terrain line-of-sight identifies clear and masked sensor rays", () => {
  const origin = new Vector3(0, 100, 0);
  const destination = new Vector3(100, 100, 0);
  assert.equal(hasTerrainLineOfSight(origin, destination, () => 0), true);
  assert.equal(
    hasTerrainLineOfSight(
      origin,
      destination,
      (x) => x > 40 && x < 65 ? 125 : 0,
    ),
    false,
  );
});

test("TADS track requires acquisition dwell and reports closure and health", () => {
  const tracker = new TargetTracker(1_500, () => 0);
  const contact = target();
  const frame = {
    position: new Vector3(0, 100, 0),
    velocity: Vector3.Zero(),
    forward: new Vector3(0, 0, -1),
  };
  assert.equal(tracker.cycle([contact], frame)?.id, contact.id);
  let track = tracker.update(0.1, frame, [contact]);
  assert.equal(track.state, "acquiring");
  for (let step = 0; step < 8; step += 1) track = tracker.update(0.1, frame, [contact]);
  assert.equal(track.state, "locked");
  assert.equal(tracker.hasWeaponLock, true);
  assert.equal(track.automatic, false);
  assert.ok(track.closureRate > 49.9 && track.closureRate < 50.1);
  assert.equal(track.healthPercent, 100);
  assert.ok(track.leadPoint);
});

test("TADS automatically prioritizes and locks hostile helicopters", () => {
  const tracker = new TargetTracker(1_500, () => 0);
  const armour = target({
    id: "armour-close",
    position: new Vector3(0, 100, -220),
  });
  const helicopter = target({
    id: "air-1",
    name: "VIPER 1",
    kind: "helicopter",
    position: new Vector3(60, 140, -620),
    velocity: new Vector3(18, 0, 0),
    health: 100,
    maxHealth: 100,
  });
  const frame = {
    position: new Vector3(0, 100, 0),
    velocity: Vector3.Zero(),
    forward: new Vector3(0, 0, -1),
  };

  let track = tracker.update(0.1, frame, [armour, helicopter]);
  assert.equal(track.id, helicopter.id);
  assert.equal(track.automatic, true);
  for (let step = 0; step < 10; step += 1) {
    track = tracker.update(0.1, frame, [armour, helicopter]);
  }
  assert.equal(track.state, "locked");
  assert.equal(tracker.hasWeaponLock, true);
});

test("TADS automatically reacquires and exposes a tactical contact picture", () => {
  const tracker = new TargetTracker(1_500, () => 0);
  const first = target({
    id: "air-1",
    name: "VIPER 1",
    kind: "helicopter",
    position: new Vector3(-80, 130, -520),
  });
  const second = target({
    id: "air-2",
    name: "VIPER 2",
    kind: "helicopter",
    position: new Vector3(140, 150, -760),
  });
  const frame = {
    position: new Vector3(0, 100, 0),
    velocity: Vector3.Zero(),
    forward: new Vector3(0, 0, -1),
  };

  assert.equal(tracker.update(0.1, frame, [first, second]).id, first.id);
  first.alive = false;
  const reacquired = tracker.update(0.1, frame, [first, second]);
  assert.equal(reacquired.id, second.id);
  assert.equal(reacquired.automatic, true);

  const contacts = tracker.contacts([first, second], frame);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].id, second.id);
  assert.equal(contacts[0].selected, true);
  assert.equal(contacts[0].kind, "helicopter");
});

test("TADS retains a coasting track when terrain masks a locked target", () => {
  let ridgeHeight = 0;
  const tracker = new TargetTracker(
    1_500,
    (x, z) => z < -180 && z > -320 ? ridgeHeight : 0,
  );
  const contact = target();
  const frame = {
    position: new Vector3(0, 100, 0),
    velocity: Vector3.Zero(),
    forward: new Vector3(0, 0, -1),
  };
  tracker.cycle([contact], frame);
  for (let step = 0; step < 9; step += 1) tracker.update(0.1, frame, [contact]);
  ridgeHeight = 150;
  const masked = tracker.update(0.1, frame, [contact]);
  assert.equal(masked.state, "masked");
  assert.equal(masked.lineOfSight, false);
  assert.ok(masked.quality > 0.7, "a masked track should coast instead of vanishing instantly");
  assert.equal(tracker.hasWeaponLock, false);
});

test("flight-data navigation uses aviation headings and waypoint solutions", () => {
  assert.equal(Math.round(courseFromVelocity(new Vector3(0, 0, -20))), 0);
  assert.equal(Math.round(courseFromVelocity(new Vector3(20, 0, 0))), 90);
  const solution = waypointSolution(
    Vector3.Zero(),
    new Vector3(1_000, 0, 0),
    20,
  );
  assert.equal(Math.round(solution.bearing), 90);
  assert.equal(solution.range, 1_000);
  assert.equal(solution.etaSeconds, 50);
});

test("flight-data computer derives air-relative performance and power state", () => {
  const computer = new FlightDataComputer();
  const input = {
    position: new Vector3(0, 1_720, 0),
    velocity: new Vector3(0, 0, -20),
    rotation: Quaternion.Identity(),
    wind: new Vector3(0, 0, -5),
    heading: 0,
    pitch: 0.08,
    roll: -0.12,
    yawRate: 0.1,
    collective: 0.62,
    rotorRpm: 0.98,
    engine: 96,
    fuel: 75,
    radarAltitudeMetres: 20,
    waypoint: new Vector3(1_000, 1_700, 0),
  };
  computer.update(1 / 60, input);
  const data = computer.update(1 / 60, input);
  assert.ok(Math.abs(data.trueAirspeed - 15 * 1.943_84) < 0.001);
  assert.ok(Math.abs(data.groundSpeed - 20 * 1.943_84) < 0.001);
  assert.equal(data.mode, "cruise");
  assert.ok(data.torque > 60 && data.torque < 90);
  assert.ok(data.powerMargin > 25);
  assert.ok(data.fuelEnduranceMinutes > 30);
  assert.ok(Math.abs(data.loadFactor - 1) < 0.01);
  assert.equal(classifyFlightMode(0.2, 0, 0), "ground");
  assert.equal(classifyFlightMode(20, 3, 250), "climb");
});
