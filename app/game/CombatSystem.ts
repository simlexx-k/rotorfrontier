import {
  Color3,
  Mesh,
  MeshBuilder,
  PointLight,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { WeaponType } from "./types";
import {
  segmentSphereHit,
  TargetTracker,
  type SensorFrame,
} from "./TargetTracker";
import { terrainHeight } from "./WorldBuilder";

export interface CombatTarget {
  id: string;
  name: string;
  kind: "helicopter" | "armour" | "sam";
  position: Vector3;
  velocity: Vector3;
  health: number;
  maxHealth?: number;
  alive: boolean;
  radius: number;
  applyDamage: (amount: number) => void;
}

interface Projectile {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  damage: number;
  team: "player" | "enemy" | "remote";
  kind: WeaponType | "enemy-round" | "enemy-missile";
  targetId?: string;
  trailTimer: number;
}

interface Explosion {
  mesh: Mesh;
  shockwave: Mesh;
  light: PointLight;
  life: number;
  duration: number;
}

interface WeaponEffect {
  mesh: Mesh;
  life: number;
  duration: number;
  growth: number;
  drift: Vector3;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export interface CombatCallbacks {
  onPlayerDamage: (amount: number, source: string, origin: Vector3) => void;
  onTargetHit: (event: {
    targetName: string;
    targetKind: CombatTarget["kind"];
    weapon: WeaponType;
    damage: number;
    destroyed: boolean;
    healthPercent: number;
    position: Vector3;
  }) => void;
  onExplosion: (position: Vector3, intensity: number) => void;
  onNotice: (message: string) => void;
}

export class CombatSystem {
  cannonAmmo = 1180;
  rockets = 38;
  missiles = 8;
  selectedWeapon: WeaponType = "hydra";
  threatLevel: "clear" | "tracking" | "missile" = "clear";
  private readonly tracker: TargetTracker;
  private readonly projectiles: Projectile[] = [];
  private readonly explosions: Explosion[] = [];
  private readonly effects: WeaponEffect[] = [];
  private readonly materials: Record<string, StandardMaterial>;
  private lastSensorTargetId = "";
  private lastSensorState = "none";

  constructor(
    private readonly scene: Scene,
    private readonly callbacks: CombatCallbacks,
    weaponUpgrade = 0,
    sensorUpgrade = 0,
  ) {
    this.cannonAmmo += weaponUpgrade * 120;
    this.rockets += weaponUpgrade * 4;
    this.missiles += Math.floor(weaponUpgrade / 2) * 2;
    this.tracker = new TargetTracker(1500 + sensorUpgrade * 360, terrainHeight);
    this.materials = {
      tracer: this.glowMaterial("tracer-material", new Color3(1, 0.72, 0.18)),
      rocket: this.glowMaterial("rocket-material", new Color3(1, 0.25, 0.04)),
      missile: this.glowMaterial("missile-material", new Color3(0.55, 0.9, 1)),
      enemy: this.glowMaterial("enemy-tracer-material", new Color3(1, 0.08, 0.03)),
      explosion: this.glowMaterial("explosion-material", new Color3(1, 0.24, 0.03)),
      smoke: this.glowMaterial("weapon-smoke-material", new Color3(0.22, 0.24, 0.23), 0.42),
      muzzle: this.glowMaterial("muzzle-flash-material", new Color3(1, 0.82, 0.22), 0.9),
      shockwave: this.glowMaterial("shockwave-material", new Color3(1, 0.48, 0.08), 0.72),
    };
  }

  get selectedTargetId() {
    return this.tracker.selectedTargetId;
  }

  fireCannon(origin: Vector3, direction: Vector3, inheritedVelocity: Vector3, team: "player" | "remote" = "player") {
    if (team === "player" && this.cannonAmmo <= 0) return false;
    if (team === "player") this.cannonAmmo -= 1;
    const spread = new Vector3(
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.008,
    );
    const aimedDirection = team === "player"
      ? this.assistedDirection(origin, direction, this.tracker.track.leadPoint, 8)
      : direction.normalize();
    const velocity = aimedDirection.add(spread).normalize().scale(390).add(inheritedVelocity);
    this.spawnProjectile(origin, velocity, 2.7, 13, team, "cannon", 0.075);
    this.spawnMuzzleFlash(origin, 0.38);
    return true;
  }

  fireSecondary(origin: Vector3, direction: Vector3, inheritedVelocity: Vector3, targets: CombatTarget[]) {
    if (this.selectedWeapon === "hydra") {
      if (this.rockets <= 0) return false;
      this.rockets -= 1;
      const aimedDirection = this.assistedDirection(
        origin,
        direction,
        this.tracker.track.position,
        6,
      );
      this.spawnProjectile(
        origin,
        aimedDirection.scale(178).add(inheritedVelocity),
        9,
        72,
        "player",
        "hydra",
        0.24,
      );
      this.spawnMuzzleFlash(origin, 0.72);
      return true;
    }
    if (this.missiles <= 0) return false;
    const target = targets.find((candidate) => candidate.id === this.selectedTargetId && candidate.alive);
    if (!target || !this.tracker.hasWeaponLock) {
      this.callbacks.onNotice(target ? "Hellfire requires a solid TADS track" : "No valid Hellfire target");
      return false;
    }
    this.missiles -= 1;
    const projectile = this.spawnProjectile(
      origin,
      direction.normalize().scale(120).add(inheritedVelocity),
      14,
      145,
      "player",
      "hellfire",
      0.28,
    );
    projectile.targetId = target.id;
    this.spawnMuzzleFlash(origin, 0.9);
    return true;
  }

  fireRemoteSecondary(
    kind: "hydra" | "hellfire",
    origin: Vector3,
    direction: Vector3,
    targetId?: string,
  ) {
    const projectile = this.spawnProjectile(
      origin,
      direction.normalize().scale(kind === "hellfire" ? 120 : 178),
      kind === "hellfire" ? 14 : 9,
      kind === "hellfire" ? 145 : 72,
      "remote",
      kind,
      kind === "hellfire" ? 0.28 : 0.24,
    );
    if (targetId) projectile.targetId = targetId;
  }

  fireEnemy(origin: Vector3, direction: Vector3, speed = 230, guided = false) {
    this.spawnProjectile(
      origin,
      direction.normalize().scale(speed),
      guided ? 8 : 4.2,
      guided ? 20 : 8,
      "enemy",
      guided ? "enemy-missile" : "enemy-round",
      guided ? 0.18 : 0.09,
    );
  }

  cycleWeapon() {
    this.selectedWeapon = this.selectedWeapon === "hydra" ? "hellfire" : "hydra";
    this.callbacks.onNotice(`${this.selectedWeapon.toUpperCase()} selected`);
  }

  cycleTarget(targets: CombatTarget[], frame: Pick<SensorFrame, "position" | "forward">) {
    const target = this.tracker.cycle(targets, frame);
    if (!target) {
      this.callbacks.onNotice("No targets detected");
      return;
    }
    this.callbacks.onNotice(`TADS acquiring · ${target.name}`);
  }

  updateSensors(delta: number, frame: SensorFrame, targets: CombatTarget[]) {
    const track = this.tracker.update(delta, frame, targets, 390);
    if (track.id && track.id !== this.lastSensorTargetId && track.automatic) {
      this.callbacks.onNotice(`AUTO TADS · ${track.name} acquired`);
    }
    if (track.id && track.state === "locked" && this.lastSensorState !== "locked") {
      this.callbacks.onNotice(`${track.automatic ? "AUTO " : ""}LOCK · ${track.name}`);
    }
    this.lastSensorTargetId = track.id;
    this.lastSensorState = track.state;
    return track;
  }

  contactInfo(targets: CombatTarget[], frame: Pick<SensorFrame, "position" | "forward">) {
    return this.tracker.contacts(targets, frame);
  }

  update(delta: number, playerPosition: Vector3, targets: CombatTarget[]) {
    this.threatLevel = "clear";
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.life -= delta;
      if (projectile.kind === "hellfire" && projectile.targetId) {
        const target = targets.find((candidate) => candidate.id === projectile.targetId && candidate.alive);
        if (target) {
          const desired = target.position.subtract(projectile.mesh.position).normalize().scale(245);
          projectile.velocity.copyFrom(Vector3.Lerp(projectile.velocity, desired, 1 - Math.exp(-delta * 3.8)));
        }
      }
      if (projectile.kind === "enemy-missile") {
        const speed = Math.max(190, projectile.velocity.length());
        const desired = playerPosition.subtract(projectile.mesh.position).normalize().scale(speed);
        projectile.velocity.copyFrom(Vector3.Lerp(projectile.velocity, desired, 1 - Math.exp(-delta * 1.7)));
      }
      if (projectile.kind === "hydra") projectile.velocity.y -= 5.2 * delta;
      projectile.trailTimer -= delta;
      const previousPosition = projectile.mesh.position.clone();
      const nextPosition = previousPosition.add(projectile.velocity.scale(delta));
      projectile.mesh.position.copyFrom(nextPosition);
      projectile.mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
        projectile.velocity.clone().normalize(),
        Vector3.Up(),
      );
      if (
        projectile.trailTimer <= 0 &&
        (projectile.kind === "hydra" ||
          projectile.kind === "hellfire" ||
          projectile.kind === "enemy-missile")
      ) {
        projectile.trailTimer = projectile.kind === "hellfire" ? 0.035 : 0.05;
        this.spawnExhaust(previousPosition, projectile.kind);
      }
      const ground = terrainHeight(nextPosition.x, nextPosition.z);
      let hit = nextPosition.y <= ground;
      let hitTarget = false;

      if (projectile.team === "enemy") {
        const distance = Vector3.Distance(nextPosition, playerPosition);
        if (projectile.kind === "enemy-missile" && distance < 720) this.threatLevel = "missile";
        else if (distance < 180 && this.threatLevel === "clear") this.threatLevel = "tracking";
        const playerHit = segmentSphereHit(previousPosition, nextPosition, playerPosition, 4.5);
        if (playerHit.hit) {
          projectile.mesh.position.copyFrom(playerHit.point);
          this.callbacks.onPlayerDamage(projectile.damage, "hostile fire", previousPosition);
          hit = true;
        }
      } else {
        for (const target of targets) {
          if (!target.alive) continue;
          const collision = segmentSphereHit(
            previousPosition,
            nextPosition,
            target.position,
            target.radius,
          );
          if (!collision.hit) continue;
          projectile.mesh.position.copyFrom(collision.point);
          target.applyDamage(projectile.damage);
          hit = true;
          hitTarget = true;
          if (projectile.team === "player") {
            const maximumHealth = Math.max(1, target.maxHealth ?? target.health + projectile.damage);
            this.callbacks.onTargetHit({
              targetName: target.name,
              targetKind: target.kind,
              weapon: projectile.kind as WeaponType,
              damage: projectile.damage,
              destroyed: !target.alive,
              healthPercent: Math.max(0, target.health / maximumHealth * 100),
              position: collision.point,
            });
          }
          break;
        }
      }

      if (hit || projectile.life <= 0) {
        if (hitTarget && projectile.kind === "cannon") {
          this.explode(projectile.mesh.position, 0.18, false);
        }
        if (hit && projectile.kind !== "cannon" && projectile.kind !== "enemy-round") {
          this.explode(projectile.mesh.position, projectile.kind === "hellfire" ? 1.35 : 0.9);
        }
        projectile.mesh.dispose();
        this.projectiles.splice(index, 1);
      }
    }

    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.explosions[index];
      explosion.life -= delta;
      const progress = 1 - explosion.life / explosion.duration;
      const scale = 1 + progress * 12;
      explosion.mesh.scaling.setAll(scale);
      explosion.shockwave.scaling.setAll(1 + progress * 18);
      const alpha = Math.max(0, 1 - progress);
      if (explosion.mesh.material instanceof StandardMaterial) explosion.mesh.material.alpha = alpha;
      explosion.shockwave.visibility = alpha;
      explosion.light.intensity = alpha * 14;
      if (explosion.life <= 0) {
        explosion.mesh.dispose();
        explosion.shockwave.dispose();
        explosion.light.dispose();
        this.explosions.splice(index, 1);
      }
    }

    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= delta;
      const progress = 1 - effect.life / effect.duration;
      effect.mesh.scaling.setAll(1 + progress * effect.growth);
      effect.mesh.position.addInPlace(effect.drift.scale(delta));
      effect.mesh.visibility = Math.max(0, 1 - progress);
      if (effect.life <= 0) {
        effect.mesh.dispose();
        this.effects.splice(index, 1);
      }
    }
  }

  targetInfo() {
    return this.tracker.track;
  }

  explode(position: Vector3, intensity = 1, notify = true) {
    const mesh = MeshBuilder.CreateSphere("explosion", { diameter: 1.5, segments: 8 }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = this.materials.explosion.clone(`explosion-${performance.now()}`);
    const shockwave = MeshBuilder.CreateTorus(
      "explosion-shockwave",
      { diameter: 2.2 * intensity, thickness: 0.09 * intensity, tessellation: 32 },
      this.scene,
    );
    shockwave.position.copyFrom(position);
    shockwave.material = this.materials.shockwave;
    const light = new PointLight("explosion-light", position.clone(), this.scene);
    light.diffuse = new Color3(1, 0.22, 0.04);
    light.range = 80 * intensity;
    const duration = 0.42 * intensity;
    this.explosions.push({ mesh, shockwave, light, life: duration, duration });
    if (notify) this.callbacks.onExplosion(position, intensity);
  }

  dispose() {
    for (const projectile of this.projectiles) projectile.mesh.dispose();
    for (const explosion of this.explosions) {
      explosion.mesh.dispose();
      explosion.shockwave.dispose();
      explosion.light.dispose();
    }
    for (const effect of this.effects) effect.mesh.dispose();
  }

  private spawnProjectile(
    origin: Vector3,
    velocity: Vector3,
    life: number,
    damage: number,
    team: Projectile["team"],
    kind: Projectile["kind"],
    diameter: number,
  ) {
    const streakLength = kind === "cannon"
      ? 3.2
      : kind === "enemy-round"
        ? 1.8
        : kind === "hellfire" || kind === "enemy-missile"
          ? 1.45
          : 1.1;
    const mesh = MeshBuilder.CreateBox(
      `projectile-${kind}`,
      { width: diameter, height: diameter, depth: streakLength },
      this.scene,
    );
    mesh.position.copyFrom(origin);
    mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
      velocity.clone().normalize(),
      Vector3.Up(),
    );
    mesh.material = kind === "cannon"
      ? this.materials.tracer
      : kind === "enemy-round" || kind === "enemy-missile"
        ? this.materials.enemy
        : kind === "hellfire"
          ? this.materials.missile
          : this.materials.rocket;
    const projectile: Projectile = {
      mesh,
      velocity,
      life,
      damage,
      team,
      kind,
      trailTimer: 0,
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  private glowMaterial(name: string, color: Color3, alpha = 1) {
    const result = new StandardMaterial(name, this.scene);
    result.diffuseColor = color;
    result.emissiveColor = color;
    result.disableLighting = true;
    result.alpha = alpha;
    return result;
  }

  private assistedDirection(
    origin: Vector3,
    fallback: Vector3,
    aimPoint: Vector3 | null,
    maximumAssistDegrees: number,
  ) {
    const baseline = fallback.normalize();
    const track = this.tracker.track;
    if (!aimPoint || track.quality < 0.28 || !track.lineOfSight) return baseline;
    const desired = aimPoint.subtract(origin).normalize();
    const angle = Math.acos(clamp(Vector3.Dot(baseline, desired), -1, 1));
    const maximum = maximumAssistDegrees * Math.PI / 180;
    if (angle <= maximum) return desired;
    return Vector3.Lerp(baseline, desired, maximum / Math.max(angle, 0.0001)).normalize();
  }

  private spawnMuzzleFlash(position: Vector3, size: number) {
    this.spawnEffect(position, this.materials.muzzle, 0.07, size * 1.8, Vector3.Zero(), size);
  }

  private spawnExhaust(position: Vector3, kind: Projectile["kind"]) {
    const glow = kind === "hellfire" ? this.materials.missile : kind === "enemy-missile" ? this.materials.enemy : this.materials.rocket;
    this.spawnEffect(position, glow, 0.12, 1.8, Vector3.Zero(), 0.18);
    this.spawnEffect(
      position,
      this.materials.smoke,
      kind === "hellfire" ? 0.72 : 0.52,
      kind === "hellfire" ? 4.2 : 3.2,
      new Vector3(0, 0.8, 0),
      kind === "hellfire" ? 0.24 : 0.18,
    );
  }

  private spawnEffect(
    position: Vector3,
    material: StandardMaterial,
    duration: number,
    growth: number,
    drift: Vector3,
    diameter: number,
  ) {
    if (this.effects.length >= 280) {
      this.effects.shift()?.mesh.dispose();
    }
    const mesh = MeshBuilder.CreateSphere(
      "weapon-effect",
      { diameter, segments: 5 },
      this.scene,
    );
    mesh.position.copyFrom(position);
    mesh.material = material;
    this.effects.push({ mesh, life: duration, duration, growth, drift });
  }
}
