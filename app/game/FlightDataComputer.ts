import { Quaternion, Vector3 } from "@babylonjs/core";
import type { FlightDataTelemetry, FlightMode } from "./types";

export interface FlightDataInput {
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  wind: Vector3;
  heading: number;
  pitch: number;
  roll: number;
  yawRate: number;
  collective: number;
  rotorRpm: number;
  engine: number;
  fuel: number;
  radarAltitudeMetres: number;
  waypoint: Vector3 | null;
}

const KNOTS_PER_METRE_SECOND = 1.943_84;
const FEET_PER_METRE = 3.280_84;
const FEET_PER_MINUTE_PER_METRE_SECOND = 196.850_394;
const GRAVITY = new Vector3(0, -9.81, 0);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const horizontalSpeed = (velocity: Vector3) => Math.hypot(velocity.x, velocity.z);
const normalizeAngle = (degrees: number) => ((degrees + 540) % 360) - 180;
const bearingTo = (origin: Vector3, destination: Vector3) => {
  const direction = destination.subtract(origin);
  return (Math.atan2(direction.x, -direction.z) * 180 / Math.PI + 360) % 360;
};

export const courseFromVelocity = (velocity: Vector3, fallbackHeading = 0) =>
  horizontalSpeed(velocity) < 0.5
    ? fallbackHeading
    : bearingTo(Vector3.Zero(), velocity);

export const classifyFlightMode = (
  radarAltitudeMetres: number,
  groundSpeedKnots: number,
  verticalSpeedFeetPerMinute: number,
): FlightMode => {
  if (radarAltitudeMetres < 0.75 && groundSpeedKnots < 4) return "ground";
  if (verticalSpeedFeetPerMinute > 180) return "climb";
  if (verticalSpeedFeetPerMinute < -180) return "descent";
  if (groundSpeedKnots < 12) return "hover";
  return "cruise";
};

export const waypointSolution = (
  position: Vector3,
  waypoint: Vector3 | null,
  groundSpeedMetresSecond: number,
) => {
  if (!waypoint) {
    return { bearing: 0, range: 0, etaSeconds: 0, active: false };
  }
  const range = Math.hypot(waypoint.x - position.x, waypoint.z - position.z);
  return {
    bearing: bearingTo(position, waypoint),
    range,
    etaSeconds: groundSpeedMetresSecond > 2.5 ? range / groundSpeedMetresSecond : 0,
    active: true,
  };
};

export const EMPTY_FLIGHT_DATA: FlightDataTelemetry = {
  mode: "ground",
  trueAirspeed: 0,
  groundSpeed: 0,
  course: 0,
  drift: 0,
  verticalSpeed: 0,
  pitch: 0,
  roll: 0,
  turnRate: 0,
  loadFactor: 1,
  torque: 0,
  enginePower: 0,
  powerMargin: 0,
  fuelEnduranceMinutes: 0,
  waypointActive: false,
  waypointBearing: 0,
  waypointRange: 0,
  waypointEtaSeconds: 0,
};

export class FlightDataComputer {
  private previousVelocity: Vector3 | null = null;
  private filteredLoadFactor = 1;
  private data: FlightDataTelemetry = { ...EMPTY_FLIGHT_DATA };

  update(delta: number, input: FlightDataInput) {
    const safeDelta = Math.max(0.001, delta);
    const airRelativeVelocity = input.velocity.subtract(input.wind);
    const groundSpeedMetresSecond = horizontalSpeed(input.velocity);
    const trueAirspeed = airRelativeVelocity.length() * KNOTS_PER_METRE_SECOND;
    const groundSpeed = groundSpeedMetresSecond * KNOTS_PER_METRE_SECOND;
    const course = courseFromVelocity(input.velocity, input.heading);
    const verticalSpeed = input.velocity.y * FEET_PER_MINUTE_PER_METRE_SECOND;

    if (this.previousVelocity) {
      const acceleration = input.velocity.subtract(this.previousVelocity).scale(1 / safeDelta);
      const up = Vector3.Up().applyRotationQuaternion(input.rotation);
      const specificForce = acceleration.subtract(GRAVITY);
      const rawLoadFactor = clamp(Vector3.Dot(specificForce, up) / 9.81, -1.5, 4.5);
      const smoothing = 1 - Math.exp(-safeDelta * 4.5);
      this.filteredLoadFactor += (rawLoadFactor - this.filteredLoadFactor) * smoothing;
    }
    this.previousVelocity = input.velocity.clone();

    const engineAvailability = clamp(input.engine / 100, 0.2, 1);
    const torque = clamp(
      input.collective * 100 * (0.72 + input.rotorRpm * input.rotorRpm * 0.34) /
        engineAvailability,
      0,
      125,
    );
    const enginePower = clamp(
      input.engine * (0.52 + input.collective * 0.48),
      0,
      100,
    );
    const powerMargin = clamp(input.engine - torque * 0.72, -25, 100);
    const fuelBurnPercentPerSecond = 0.012 + input.collective * 0.018;
    const fuelEnduranceMinutes = input.fuel / fuelBurnPercentPerSecond / 60;
    const waypoint = waypointSolution(input.position, input.waypoint, groundSpeedMetresSecond);

    this.data = {
      mode: classifyFlightMode(input.radarAltitudeMetres, groundSpeed, verticalSpeed),
      trueAirspeed,
      groundSpeed,
      course,
      drift: normalizeAngle(course - input.heading),
      verticalSpeed,
      pitch: input.pitch * 180 / Math.PI,
      roll: input.roll * 180 / Math.PI,
      turnRate: input.yawRate * 180 / Math.PI,
      loadFactor: this.filteredLoadFactor,
      torque,
      enginePower,
      powerMargin,
      fuelEnduranceMinutes,
      waypointActive: waypoint.active,
      waypointBearing: waypoint.bearing,
      waypointRange: waypoint.range,
      waypointEtaSeconds: waypoint.etaSeconds,
    };
    return this.snapshot;
  }

  get snapshot() {
    return { ...this.data };
  }

  reset() {
    this.previousVelocity = null;
    this.filteredLoadFactor = 1;
    this.data = { ...EMPTY_FLIGHT_DATA };
  }
}

export const metresToFeet = (metres: number) => metres * FEET_PER_METRE;
