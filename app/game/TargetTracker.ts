import { Vector3 } from "@babylonjs/core";
import type { CombatTarget } from "./CombatSystem";

export type TargetTrackState =
  | "none"
  | "acquiring"
  | "tracking"
  | "locked"
  | "masked"
  | "lost";

export interface TargetTrack {
  id: string;
  name: string;
  kind: CombatTarget["kind"] | "none";
  state: TargetTrackState;
  quality: number;
  distance: number;
  closureRate: number;
  bearing: number;
  relativeBearing: number;
  elevation: number;
  healthPercent: number;
  lineOfSight: boolean;
  insideFieldOfView: boolean;
  position: Vector3 | null;
  leadPoint: Vector3 | null;
  leadTime: number;
}

export interface SensorFrame {
  position: Vector3;
  velocity: Vector3;
  forward: Vector3;
}

const EMPTY_TRACK: TargetTrack = {
  id: "",
  name: "NO TARGET",
  kind: "none",
  state: "none",
  quality: 0,
  distance: 0,
  closureRate: 0,
  bearing: 0,
  relativeBearing: 0,
  elevation: 0,
  healthPercent: 0,
  lineOfSight: false,
  insideFieldOfView: false,
  position: null,
  leadPoint: null,
  leadTime: 0,
};

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export const normalizeAngle = (degrees: number) =>
  ((degrees + 540) % 360) - 180;

export const bearingTo = (origin: Vector3, destination: Vector3) => {
  const direction = destination.subtract(origin);
  return (Math.atan2(direction.x, -direction.z) * 180 / Math.PI + 360) % 360;
};

export function hasTerrainLineOfSight(
  origin: Vector3,
  destination: Vector3,
  sampleHeight: (x: number, z: number) => number,
  samples = 16,
) {
  const start = origin.add(new Vector3(0, 1.5, 0));
  const end = destination.add(new Vector3(0, 1.2, 0));
  for (let index = 1; index < samples; index += 1) {
    const amount = index / samples;
    if (amount > 0.9) break;
    const point = Vector3.Lerp(start, end, amount);
    if (sampleHeight(point.x, point.z) > point.y - 1.25) return false;
  }
  return true;
}

export function solveInterceptPoint(
  origin: Vector3,
  projectileSpeed: number,
  targetPosition: Vector3,
  targetVelocity: Vector3,
) {
  const relative = targetPosition.subtract(origin);
  const a = Vector3.Dot(targetVelocity, targetVelocity) - projectileSpeed * projectileSpeed;
  const b = 2 * Vector3.Dot(relative, targetVelocity);
  const c = Vector3.Dot(relative, relative);
  let time = 0;

  if (Math.abs(a) < 0.000_001) {
    if (Math.abs(b) > 0.000_001) time = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const first = (-b - root) / (2 * a);
      const second = (-b + root) / (2 * a);
      const valid = [first, second].filter((candidate) => candidate > 0);
      if (valid.length) time = Math.min(...valid);
    }
  }

  if (!Number.isFinite(time) || time <= 0) {
    time = relative.length() / Math.max(1, projectileSpeed);
  }
  time = clamp(time, 0, 12);
  return {
    point: targetPosition.add(targetVelocity.scale(time)),
    time,
  };
}

export function segmentSphereHit(
  start: Vector3,
  end: Vector3,
  centre: Vector3,
  radius: number,
) {
  const segment = end.subtract(start);
  const lengthSquared = segment.lengthSquared();
  const amount = lengthSquared <= 0.000_001
    ? 0
    : clamp(Vector3.Dot(centre.subtract(start), segment) / lengthSquared);
  const point = start.add(segment.scale(amount));
  return {
    hit: Vector3.DistanceSquared(point, centre) <= radius * radius,
    point,
    amount,
  };
}

export class TargetTracker {
  selectedTargetId = "";
  private quality = 0;
  private lostTime = 0;
  private current: TargetTrack = { ...EMPTY_TRACK };
  private readonly halfFieldOfViewRadians: number;

  constructor(
    readonly sensorRange: number,
    private readonly sampleHeight: (x: number, z: number) => number,
    fieldOfViewDegrees = 230,
  ) {
    this.halfFieldOfViewRadians = fieldOfViewDegrees * Math.PI / 360;
  }

  cycle(targets: CombatTarget[], frame: Pick<SensorFrame, "position" | "forward">) {
    const forward = frame.forward.normalize();
    const available = targets
      .filter((target) => target.alive)
      .map((target) => {
        const offset = target.position.subtract(frame.position);
        const distance = offset.length();
        const angle = distance > 0
          ? Math.acos(clamp(Vector3.Dot(offset.scale(1 / distance), forward), -1, 1))
          : 0;
        const visible = hasTerrainLineOfSight(frame.position, target.position, this.sampleHeight);
        return { target, distance, angle, visible };
      })
      .filter((candidate) =>
        candidate.distance <= this.sensorRange &&
        candidate.angle <= this.halfFieldOfViewRadians &&
        candidate.visible
      )
      .sort((left, right) => {
        const leftScore = left.angle * 900 + left.distance;
        const rightScore = right.angle * 900 + right.distance;
        return leftScore - rightScore;
      });

    if (!available.length) {
      this.clear();
      return null;
    }
    const currentIndex = available.findIndex(
      (candidate) => candidate.target.id === this.selectedTargetId,
    );
    const next = available[(currentIndex + 1) % available.length].target;
    if (next.id !== this.selectedTargetId) {
      this.quality = 0;
      this.lostTime = 0;
    }
    this.selectedTargetId = next.id;
    return next;
  }

  update(delta: number, frame: SensorFrame, targets: CombatTarget[], projectileSpeed = 390) {
    const target = targets.find(
      (candidate) => candidate.id === this.selectedTargetId && candidate.alive,
    );
    if (!target) {
      this.clear();
      return this.track;
    }

    const offset = target.position.subtract(frame.position);
    const distance = Math.max(0.001, offset.length());
    const direction = offset.scale(1 / distance);
    const forward = frame.forward.normalize();
    const angle = Math.acos(clamp(Vector3.Dot(direction, forward), -1, 1));
    const insideFieldOfView = angle <= this.halfFieldOfViewRadians;
    const insideRange = distance <= this.sensorRange;
    const lineOfSight = hasTerrainLineOfSight(
      frame.position,
      target.position,
      this.sampleHeight,
    );
    const validSignal = insideFieldOfView && insideRange && lineOfSight;

    if (validSignal) {
      const centring = 1 - clamp(angle / this.halfFieldOfViewRadians);
      const rangeStrength = 1 - clamp(distance / this.sensorRange);
      this.quality = clamp(
        this.quality + delta * (0.62 + centring * 0.42 + rangeStrength * 0.28),
      );
      this.lostTime = 0;
    } else {
      this.quality = clamp(this.quality - delta * (lineOfSight ? 0.44 : 0.3));
      this.lostTime += delta;
    }

    if (this.quality <= 0 && this.lostTime > 3) {
      this.clear();
      return this.track;
    }

    const targetHeading = bearingTo(frame.position, target.position);
    const forwardPoint = frame.position.add(forward);
    const ownHeading = bearingTo(frame.position, forwardPoint);
    const radialVelocity = target.velocity.subtract(frame.velocity);
    const closureRate = -Vector3.Dot(radialVelocity, direction);
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    const intercept = solveInterceptPoint(
      frame.position,
      projectileSpeed,
      target.position,
      target.velocity.subtract(frame.velocity),
    );
    const maximumHealth = Math.max(1, target.maxHealth ?? target.health);
    let state: TargetTrackState;
    if (!lineOfSight) state = "masked";
    else if (!insideFieldOfView || !insideRange) state = "lost";
    else if (this.quality >= 0.82) state = "locked";
    else if (this.quality >= 0.28) state = "tracking";
    else state = "acquiring";

    this.current = {
      id: target.id,
      name: target.name,
      kind: target.kind,
      state,
      quality: this.quality,
      distance,
      closureRate,
      bearing: targetHeading,
      relativeBearing: normalizeAngle(targetHeading - ownHeading),
      elevation: Math.atan2(offset.y, Math.max(0.001, horizontalDistance)) * 180 / Math.PI,
      healthPercent: clamp(target.health / maximumHealth) * 100,
      lineOfSight,
      insideFieldOfView,
      position: target.position.clone(),
      leadPoint: intercept.point,
      leadTime: intercept.time,
    };
    return this.track;
  }

  get track(): TargetTrack {
    return {
      ...this.current,
      position: this.current.position?.clone() ?? null,
      leadPoint: this.current.leadPoint?.clone() ?? null,
    };
  }

  get hasWeaponLock() {
    return this.current.state === "locked" && this.current.lineOfSight;
  }

  clear() {
    this.selectedTargetId = "";
    this.quality = 0;
    this.lostTime = 0;
    this.current = { ...EMPTY_TRACK };
  }
}
