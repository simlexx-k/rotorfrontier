import { Quaternion, Vector3 } from "@babylonjs/core";
import type { ControlFrame, GameSettings } from "./types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const moveToward = (current: number, target: number, rate: number) => current + (target - current) * clamp(rate, 0, 1);

export const FLIGHT_GROUND_CLEARANCE_METRES = 1.3;

type GroundHeight = number | ((x: number, z: number) => number);

export interface FlightStepResult { impact: number; hardLanding: boolean; }

export class FlightModel {
  readonly position = new Vector3(0, FLIGHT_GROUND_CLEARANCE_METRES, 120);
  readonly velocity = new Vector3(0, 0, 0);
  readonly rotation = Quaternion.Identity();
  pitch = 0;
  roll = 0;
  yaw = Math.PI;
  pitchRate = 0;
  rollRate = 0;
  yawRate = 0;
  collective = 0.5;
  rotorRpm = 0.98;
  fuel = 100;
  hull = 100;
  engine = 100;
  hoverAssist: boolean;

  constructor(
    private readonly settings: GameSettings,
    private readonly engineUpgrade = 0,
  ) {
    this.hoverAssist = settings.flightAssist;
  }

  step(delta: number, controls: ControlFrame, groundHeight: GroundHeight, wind: Vector3): FlightStepResult {
    const dt = Math.min(delta, 1 / 20);
    const sampleGround = (x: number, z: number) =>
      typeof groundHeight === "function" ? groundHeight(x, z) : groundHeight;
    const currentGround = sampleGround(this.position.x, this.position.z);
    const radarAltitude = Math.max(
      0,
      this.position.y - currentGround - FLIGHT_GROUND_CLEARANCE_METRES,
    );
    const onGround = radarAltitude <= 0.05 && this.velocity.y <= 0.12;
    const damageFactor = 0.35 + (this.engine / 100) * 0.65;
    this.rotorRpm = moveToward(this.rotorRpm, damageFactor, dt * 0.42);

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const rotorDiscEfficiency = 1 + Math.min(horizontalSpeed / 62, 0.19);
    const groundEffect = radarAltitude < 18 ? 1 + (1 - radarAltitude / 18) * 0.16 : 1;
    const density = clamp(1 - this.position.y / 12500, 0.72, 1);
    const availableLift =
      18.7 *
      (1 + this.engineUpgrade * 0.035) *
      this.rotorRpm *
      this.rotorRpm *
      rotorDiscEfficiency *
      groundEffect *
      density;

    if (this.hoverAssist) {
      // In the default accessible mode the vertical input is a hold-to-climb or
      // hold-to-descend command. Releasing it commands a hover instead of leaving
      // the player to find and retain a narrow collective setting.
      const targetVerticalSpeed = controls.collective >= 0
        ? controls.collective * 8
        : controls.collective * 5.5;
      const hoverCollective = clamp(9.81 / Math.max(availableLift, 0.01), 0.44, 0.88);
      const targetCollective = onGround && controls.collective <= 0
        ? 0.43
        : clamp(
            hoverCollective + (targetVerticalSpeed - this.velocity.y) * 0.05,
            0.1,
            1,
          );
      this.collective = moveToward(this.collective, targetCollective, dt * 7.5);
    } else {
      // Advanced mode keeps the original persistent collective workflow.
      this.collective = clamp(this.collective + controls.collective * dt * 0.55, 0.08, 1);
    }

    if (this.hoverAssist) {
      const targetPitch = controls.pitch * 0.2;
      const targetRoll = controls.roll * 0.24;
      const targetPitchRate = clamp((targetPitch - this.pitch) * 5.4, -1.15, 1.15);
      const targetRollRate = clamp((targetRoll - this.roll) * 5.7, -1.35, 1.35);
      this.pitchRate = moveToward(this.pitchRate, targetPitchRate, dt * 9.2);
      this.rollRate = moveToward(this.rollRate, targetRollRate, dt * 9.5);
    } else {
      this.pitchRate = moveToward(this.pitchRate, controls.pitch * 1.48, dt * 4.1);
      this.rollRate = moveToward(this.rollRate, controls.roll * 1.7, dt * 4.3);
    }
    this.yawRate = moveToward(
      this.yawRate,
      controls.yaw * (this.hoverAssist ? 1.18 : 0.95),
      dt * (this.hoverAssist ? 6.2 : 3.8),
    );

    this.pitch = clamp(this.pitch + this.pitchRate * dt, -0.72, 0.72);
    this.roll = clamp(this.roll + this.rollRate * dt, -0.92, 0.92);
    this.yaw += this.yawRate * dt;
    Quaternion.RotationYawPitchRollToRef(this.yaw, this.pitch, this.roll, this.rotation);

    const up = Vector3.Up().applyRotationQuaternion(this.rotation);
    const liftAcceleration = 18.7 * (1 + this.engineUpgrade * 0.035) * this.collective * this.rotorRpm * this.rotorRpm * rotorDiscEfficiency * groundEffect * density;

    const acceleration = up.scale(liftAcceleration);
    acceleration.y -= 9.81;

    if (this.hoverAssist && (!onGround || controls.collective > 0)) {
      // A velocity-command layer makes WASD and the left stick predictable: the
      // aircraft accelerates in the requested aircraft-relative direction, then
      // automatically brakes when the control is released. The visible attitude
      // still follows cyclic input and the underlying lift/drag model remains live.
      const forward = Vector3.Forward().applyRotationQuaternion(this.rotation);
      forward.y = 0;
      if (forward.lengthSquared() > 0.0001) forward.normalize();
      const right = Vector3.Right().applyRotationQuaternion(this.rotation);
      right.y = 0;
      if (right.lengthSquared() > 0.0001) right.normalize();

      const longitudinalSpeed = controls.pitch >= 0 ? 44 : 27;
      const desiredVelocity = forward
        .scale(controls.pitch * longitudinalSpeed)
        .addInPlace(right.scale(-controls.roll * 31));
      const requestedSpeed = Math.min(48, desiredVelocity.length());
      if (desiredVelocity.lengthSquared() > 48 * 48) {
        desiredVelocity.normalize().scaleInPlace(requestedSpeed);
      }

      const velocityError = desiredVelocity.subtract(
        new Vector3(this.velocity.x, 0, this.velocity.z),
      );
      const horizontalAcceleration = velocityError.scale(
        Math.abs(controls.pitch) + Math.abs(controls.roll) > 0.01 ? 1.75 : 2.8,
      );
      const maximumAcceleration =
        Math.abs(controls.pitch) + Math.abs(controls.roll) > 0.01 ? 17 : 21;
      if (horizontalAcceleration.lengthSquared() > maximumAcceleration * maximumAcceleration) {
        horizontalAcceleration.normalize().scaleInPlace(maximumAcceleration);
      }
      acceleration.addInPlace(horizontalAcceleration);
    }

    acceleration.addInPlace(wind.subtract(this.velocity).scale(0.016));
    acceleration.addInPlace(new Vector3(
      -this.velocity.x * Math.abs(this.velocity.x) * 0.0032,
      -this.velocity.y * Math.abs(this.velocity.y) * 0.006,
      -this.velocity.z * Math.abs(this.velocity.z) * 0.0032,
    ));

    this.velocity.addInPlace(acceleration.scale(dt));
    this.position.addInPlace(this.velocity.scale(dt));
    this.fuel = Math.max(0, this.fuel - dt * (0.012 + this.collective * 0.018));

    const landedGround = sampleGround(this.position.x, this.position.z);
    const minimumY = landedGround + FLIGHT_GROUND_CLEARANCE_METRES;
    let impact = 0;
    let hardLanding = false;
    if (this.position.y < minimumY) {
      impact = Math.max(0, -this.velocity.y);
      this.position.y = minimumY;
      if (impact > 4.5) {
        const damage = (impact - 4.5) * 2.8;
        this.hull = Math.max(0, this.hull - damage);
        if (impact > 8) this.engine = Math.max(0, this.engine - damage * 0.45);
        hardLanding = true;
      }
      this.velocity.y = 0;
      const skidFriction = Math.exp(-dt * 11);
      this.velocity.x *= skidFriction;
      this.velocity.z *= skidFriction;
    }
    return { impact, hardLanding };
  }

  get airspeed() { return this.velocity.length() * 1.94384; }
  get verticalSpeed() { return this.velocity.y * 196.85; }
  get heading() { return (((this.yaw * 180) / Math.PI + 360) % 360 + 180) % 360; }
}
