import { Vector3 } from "@babylonjs/core";
import type { MissionDefinition, MissionPhase } from "./types";

export interface MissionSignals {
  playerPosition: Vector3;
  speed: number;
  radarAltitude: number;
  destroyedAir: number;
  destroyedGround: number;
  remainingEnemies: number;
}

export interface MissionState {
  objective: string;
  detail: string;
  progress: number;
  completed: boolean;
  phase: MissionPhase;
  waypoint: Vector3 | null;
  holdRemaining: number;
}

const base = new Vector3(0, 0, 120);

export class MissionDirector {
  private phase = 0;
  private holdTime = 0;
  private completed = false;
  private state: MissionState;

  constructor(private readonly mission: MissionDefinition) {
    this.state = {
      objective: mission.objective,
      detail: "Follow the navigation marker",
      progress: 0,
      completed: false,
      phase: "nav",
      waypoint: null,
      holdRemaining: 0,
    };
  }

  update(delta: number, signals: MissionSignals): MissionState {
    if (this.completed) return this.state;
    if (this.mission.id === "first-light") this.updateRecon(delta, signals);
    if (this.mission.id === "broken-spear") this.updateInterdiction(signals);
    if (this.mission.id === "silent-river") this.updateExtraction(delta, signals);
    return this.state;
  }

  private updateRecon(delta: number, signals: MissionSignals) {
    const points = [
      new Vector3(-1650, 0, -1430),
      new Vector3(-720, 0, 2440),
      base,
    ];
    const labels = [
      "Scan the northern signal site",
      "Inspect the ridge relay",
      "Return to the forward operating base",
    ];
    const distance = this.horizontalDistance(signals.playerPosition, points[this.phase]);
    const close = distance < (this.phase === 2 ? 90 : 140);
    this.holdTime = close ? this.holdTime + delta : Math.max(0, this.holdTime - delta * 0.5);
    const requiredHold = this.phase === 2 ? 1.5 : 3.5;
    this.state = {
      objective: labels[this.phase],
      detail: close ? `Maintain position · ${Math.max(0, requiredHold - this.holdTime).toFixed(1)} s` : `${Math.round(distance)} m to waypoint`,
      progress: (this.phase + Math.min(1, this.holdTime / requiredHold)) / points.length,
      completed: false,
      phase: close ? "hold" : this.phase === 2 ? "rtb" : "nav",
      waypoint: points[this.phase].clone(),
      holdRemaining: close ? Math.max(0, requiredHold - this.holdTime) : 0,
    };
    if (this.holdTime >= requiredHold) {
      this.phase += 1;
      this.holdTime = 0;
      if (this.phase >= points.length) this.finish();
    }
  }

  private updateInterdiction(signals: MissionSignals) {
    if (this.phase === 0) {
      const required = 6;
      this.state = {
        objective: "Destroy the mobile air-defence column",
        detail: `${signals.destroyedGround} / ${required} ground targets disabled`,
        progress: Math.min(0.82, signals.destroyedGround / required * 0.82),
        completed: false,
        phase: "engage",
        waypoint: new Vector3(1820, 0, 1020),
        holdRemaining: 0,
      };
      if (signals.destroyedGround >= required) this.phase = 1;
      return;
    }
    const distance = this.horizontalDistance(signals.playerPosition, base);
    this.state = {
      objective: "Return to base",
      detail: `${Math.round(distance)} m to landing zone`,
      progress: 0.82 + (1 - Math.min(1, distance / 2800)) * 0.18,
      completed: false,
      phase: "rtb",
      waypoint: base.clone(),
      holdRemaining: 0,
    };
    if (distance < 95 && signals.speed < 18) this.finish();
  }

  private updateExtraction(delta: number, signals: MissionSignals) {
    const zone = new Vector3(1240, 0, 2660);
    if (this.phase === 0) {
      const distance = this.horizontalDistance(signals.playerPosition, zone);
      this.state = {
        objective: "Reach the extraction compound",
        detail: `${Math.round(distance)} m to extraction beacon`,
        progress: (1 - Math.min(1, distance / 3600)) * 0.48,
        completed: false,
        phase: "nav",
        waypoint: zone.clone(),
        holdRemaining: 0,
      };
      if (distance < 120) this.phase = 1;
      return;
    }
    if (this.phase === 1) {
      const stable = signals.speed < 14 && signals.radarAltitude < 45;
      this.holdTime = stable ? this.holdTime + delta : Math.max(0, this.holdTime - delta * 0.7);
      this.state = {
        objective: "Hold a stable recovery hover",
        detail: stable ? `${Math.max(0, 22 - this.holdTime).toFixed(1)} s until team aboard` : "Reduce speed and descend below 45 m",
        progress: 0.48 + Math.min(1, this.holdTime / 22) * 0.34,
        completed: false,
        phase: "hold",
        waypoint: zone.clone(),
        holdRemaining: Math.max(0, 22 - this.holdTime),
      };
      if (this.holdTime >= 22) this.phase = 2;
      return;
    }
    const distance = this.horizontalDistance(signals.playerPosition, base);
    this.state = {
      objective: "Extract the recovery team to base",
      detail: `${Math.round(distance)} m to safety`,
      progress: 0.82 + (1 - Math.min(1, distance / 3000)) * 0.18,
      completed: false,
      phase: "rtb",
      waypoint: base.clone(),
      holdRemaining: 0,
    };
    if (distance < 95 && signals.speed < 18) this.finish();
  }

  private finish() {
    this.completed = true;
    this.state = {
      objective: "Operation complete",
      detail: "Mission objectives secured",
      progress: 1,
      completed: true,
      phase: "complete",
      waypoint: null,
      holdRemaining: 0,
    };
  }

  private horizontalDistance(a: Vector3, b: Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
