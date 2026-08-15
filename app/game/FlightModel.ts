import { Quaternion, Vector3 } from "@babylonjs/core";
import type { ControlFrame, GameSettings } from "./types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const moveToward = (current: number, target: number, rate: number) => current + (target - current) * clamp(rate, 0, 1);

export interface FlightStepResult { impact: number; hardLanding: boolean; }

export class FlightModel {
  readonly position = new Vector3(0, 86, 120);
  readonly velocity = new Vector3(0, 0, 0);
  readonly rotation = Quaternion.Identity();
  pitch = 0;
  roll = 0;
  yaw = Math.PI;
  pitchRate = 0;
  rollRate = 0;
  yawRate = 0;
  collective = 0.54;
  rotorRpm = 0.88;
  fuel = 100;
  hull = 100;
  engine = 100;
  hoverAssist: boolean;

  constructor(private readonly settings: GameSettings) {
    this.hoverAssist = settings.flightAssist;
  }

  step(delta: number, controls: ControlFrame, groundHeight: number, wind: Vector3): FlightStepResult {
    const dt = Math.min(delta, 1 / 20);
    const damageFactor = 0.35 + (this.engine / 100) * 0.65;
    this.rotorRpm = moveToward(this.rotorRpm, damageFactor, dt * 0.38);
    this.collective = clamp(this.collective + controls.collective * dt * 0.34, 0.08, 1);

    const cyclicRate = this.hoverAssist ? 1.18 : 1.55;
    this.pitchRate = moveToward(this.pitchRate, controls.pitch * cyclicRate, dt * 4.1);
    this.rollRate = moveToward(this.rollRate, controls.roll * cyclicRate * 1.15, dt * 4.3);
    this.yawRate = moveToward(this.yawRate, controls.yaw * 0.92, dt * 3.4);

    if (this.hoverAssist && Math.abs(controls.pitch) < 0.08) this.pitchRate += -this.pitch * dt * 2.6;
    if (this.hoverAssist && Math.abs(controls.roll) < 0.08) this.rollRate += -this.roll * dt * 3.2;

    this.pitch = clamp(this.pitch + this.pitchRate * dt, -0.72, 0.72);
    this.roll = clamp(this.roll + this.rollRate * dt, -0.92, 0.92);
    this.yaw += this.yawRate * dt;
    Quaternion.RotationYawPitchRollToRef(this.yaw, this.pitch, this.roll, this.rotation);

    const up = Vector3.Up().applyRotationQuaternion(this.rotation);
    const forward = Vector3.Forward().applyRotationQuaternion(this.rotation);
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const rotorDiscEfficiency = 1 + Math.min(horizontalSpeed / 62, 0.19);
    const radarAltitude = Math.max(0, this.position.y - groundHeight - 1.7);
    const groundEffect = radarAltitude < 18 ? 1 + (1 - radarAltitude / 18) * 0.16 : 1;
    const density = clamp(1 - this.position.y / 12500, 0.72, 1);
    const liftAcceleration = 16.7 * this.collective * this.rotorRpm * this.rotorRpm * rotorDiscEfficiency * groundEffect * density;

    const acceleration = up.scale(liftAcceleration);
    acceleration.y -= 9.81;
    acceleration.addInPlace(wind.subtract(this.velocity).scale(0.016));
    acceleration.addInPlace(forward.scale(Math.max(0, this.collective - 0.45) * 0.8));
    acceleration.addInPlace(new Vector3(
      -this.velocity.x * Math.abs(this.velocity.x) * 0.0032,
      -this.velocity.y * Math.abs(this.velocity.y) * 0.006,
      -this.velocity.z * Math.abs(this.velocity.z) * 0.0032,
    ));

    this.velocity.addInPlace(acceleration.scale(dt));
    this.position.addInPlace(this.velocity.scale(dt));
    this.fuel = Math.max(0, this.fuel - dt * (0.012 + this.collective * 0.018));

    const minimumY = groundHeight + 2.05;
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
      this.velocity.y = Math.max(0, -this.velocity.y * 0.06);
      this.velocity.x *= 0.82;
      this.velocity.z *= 0.82;
    }
    return { impact, hardLanding };
  }

  get airspeed() { return this.velocity.length() * 1.94384; }
  get verticalSpeed() { return this.velocity.y * 196.85; }
  get heading() { return (((this.yaw * 180) / Math.PI + 360) % 360 + 180) % 360; }
}
