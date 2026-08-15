import {
  Color3,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { MissionDefinition } from "./types";
import { createHelicopter, terrainHeight, type HelicopterVisual, type WorldBuilder } from "./WorldBuilder";
import type { CombatTarget } from "./CombatSystem";

interface EnemyEntity extends CombatTarget {
  root: TransformNode;
  visual?: HelicopterVisual;
  cooldown: number;
  phase: number;
  maxHealth: number;
  wreckTime: number;
  crashed: boolean;
}

export interface AICallbacks {
  onFire: (origin: Vector3, direction: Vector3, speed?: number, guided?: boolean) => void;
  onDestroyed: (enemy: CombatTarget) => void;
  onCrash: (enemy: CombatTarget) => void;
}

const objectivePoints: Record<string, Vector3> = {
  "first-light": new Vector3(-1650, 80, -1430),
  "broken-spear": new Vector3(1820, 80, 1020),
  "silent-river": new Vector3(1240, 70, 2660),
};

export class AISystem {
  readonly targets: CombatTarget[] = [];
  destroyedAir = 0;
  destroyedGround = 0;
  private readonly enemies: EnemyEntity[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly world: WorldBuilder,
    private readonly mission: MissionDefinition,
    private readonly callbacks: AICallbacks,
  ) {
    const airCount = mission.id === "first-light" ? 3 : mission.id === "broken-spear" ? 4 : 5;
    const groundCount = mission.id === "broken-spear" ? 6 : 3;
    for (let index = 0; index < airCount; index += 1) this.spawnHelicopter(index, mission);
    for (let index = 0; index < groundCount; index += 1) this.spawnGround(index, mission);
    this.targets.push(...this.enemies);
  }

  update(delta: number, playerPosition: Vector3, playerVelocity: Vector3) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        this.updateDestroyed(enemy, delta);
        continue;
      }
      enemy.cooldown -= delta;
      if (enemy.kind === "helicopter") {
        this.updateHelicopter(enemy, delta, playerPosition, playerVelocity);
      } else {
        this.updateGround(enemy, delta, playerPosition, playerVelocity);
      }
    }
  }

  get remainingEnemies() {
    return this.enemies.filter((enemy) => enemy.alive).length;
  }

  dispose() {
    for (const enemy of this.enemies) enemy.root.dispose(false, true);
  }

  private spawnHelicopter(index: number, mission: MissionDefinition) {
    const visual = createHelicopter(this.scene, `bandit-${index}`, new Color3(0.25, 0.08, 0.06));
    const centre = objectivePoints[mission.id];
    const angle = (index / Math.max(1, mission.id === "first-light" ? 3 : 5)) * Math.PI * 2;
    visual.root.position.set(
      centre.x + Math.sin(angle) * (520 + index * 70),
      terrainHeight(centre.x, centre.z) + 130 + index * 25,
      centre.z + Math.cos(angle) * (520 + index * 70),
    );
    visual.root.rotationQuaternion = Quaternion.Identity();
    for (const mesh of visual.shadowMeshes) this.world.shadow.addShadowCaster(mesh);
    const entity = this.makeEntity({
      id: `air-${index}`,
      name: `VIPER ${index + 1}`,
      kind: "helicopter",
      root: visual.root,
      visual,
      health: 100,
      radius: 5.2,
      phase: angle,
    });
    this.enemies.push(entity);
  }

  private spawnGround(index: number, mission: MissionDefinition) {
    const centre = objectivePoints[mission.id];
    const root = new TransformNode(`ground-${index}`, this.scene);
    const x = centre.x + (index - 2.5) * 48;
    const z = centre.z + (index % 2) * 45 - 22;
    root.position.set(x, terrainHeight(x, z) + 1.6, z);
    const body = MeshBuilder.CreateBox(`ground-body-${index}`, { width: 3.8, height: 1.35, depth: 6.8 }, this.scene);
    body.parent = root;
    const turret = MeshBuilder.CreateCylinder(`ground-turret-${index}`, { diameter: 2.3, height: 0.8, tessellation: 12 }, this.scene);
    turret.position.y = 1.05;
    turret.parent = root;
    const paint = new StandardMaterial(`ground-paint-${index}`, this.scene);
    paint.diffuseColor = index % 3 === 0 ? new Color3(0.28, 0.1, 0.06) : new Color3(0.18, 0.2, 0.12);
    body.material = paint;
    turret.material = paint;
    this.world.shadow.addShadowCaster(body);
    this.world.shadow.addShadowCaster(turret);
    const kind = index % 3 === 0 ? "sam" : "armour";
    this.enemies.push(this.makeEntity({
      id: `ground-${index}`,
      name: kind === "sam" ? `SA-19 ${index + 1}` : `COLUMN ${index + 1}`,
      kind,
      root,
      health: kind === "sam" ? 120 : 85,
      radius: 4.8,
      phase: index * 0.8,
    }));
  }

  private makeEntity(source: {
    id: string;
    name: string;
    kind: EnemyEntity["kind"];
    root: TransformNode;
    visual?: HelicopterVisual;
    health: number;
    radius: number;
    phase: number;
  }): EnemyEntity {
    const entity: EnemyEntity = {
      ...source,
      position: source.root.position,
      velocity: Vector3.Zero(),
      alive: true,
      cooldown: 1 + Math.random() * 2,
      wreckTime: 0,
      crashed: false,
      maxHealth: source.health,
      applyDamage: (amount: number) => {
        if (!entity.alive) return;
        entity.health = Math.max(0, entity.health - amount);
        if (entity.health > 0) return;
        entity.alive = false;
        entity.velocity.y = Math.min(entity.velocity.y, -3.5);
        if (entity.kind !== "helicopter") entity.root.setEnabled(false);
        if (entity.kind === "helicopter") this.destroyedAir += 1;
        else this.destroyedGround += 1;
        this.callbacks.onDestroyed(entity);
      },
    };
    return entity;
  }

  private updateDestroyed(enemy: EnemyEntity, delta: number) {
    if (enemy.kind !== "helicopter" || enemy.crashed || !enemy.root.isEnabled()) return;
    enemy.wreckTime += delta;
    enemy.velocity.y -= 16 * delta;
    enemy.velocity.x *= Math.exp(-delta * 0.38);
    enemy.velocity.z *= Math.exp(-delta * 0.38);
    enemy.position.addInPlace(enemy.velocity.scale(delta));
    enemy.phase += delta;
    enemy.root.rotationQuaternion = Quaternion.FromEulerAngles(
      enemy.phase * 1.7,
      enemy.phase * 0.55,
      enemy.phase * 2.15,
    );
    if (enemy.visual) {
      const rotorDecay = Math.max(0, 1 - enemy.wreckTime / 3.5);
      enemy.visual.rotor.rotation.y += delta * 48 * rotorDecay;
      enemy.visual.tailRotor.rotation.y += delta * 72 * rotorDecay;
    }

    const ground = terrainHeight(enemy.position.x, enemy.position.z) + 2.2;
    if (enemy.position.y <= ground || enemy.wreckTime >= 7) {
      enemy.position.y = Math.max(enemy.position.y, ground);
      enemy.crashed = true;
      this.callbacks.onCrash(enemy);
      enemy.root.setEnabled(false);
    }
  }

  private updateHelicopter(enemy: EnemyEntity, delta: number, playerPosition: Vector3, playerVelocity: Vector3) {
    const distance = Vector3.Distance(enemy.position, playerPosition);
    enemy.phase += delta * (0.18 + Number(enemy.id.slice(-1)) * 0.012);
    const engaged = distance < 1700;
    const centre = engaged ? playerPosition : objectivePoints[this.mission.id];
    const radius = engaged ? 330 : 560;
    const desired = centre.add(new Vector3(
      Math.sin(enemy.phase) * radius,
      120 + Math.sin(enemy.phase * 1.7) * 45,
      Math.cos(enemy.phase) * radius,
    ));
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 58);
    const desiredVelocity = desired.subtract(enemy.position).normalize().scale(engaged ? 48 : 32);
    enemy.velocity.copyFrom(Vector3.Lerp(enemy.velocity, desiredVelocity, 1 - Math.exp(-delta * 1.2)));
    enemy.position.addInPlace(enemy.velocity.scale(delta));
    const targetDirection = playerPosition.subtract(enemy.position);
    const yaw = Math.atan2(targetDirection.x, targetDirection.z);
    enemy.root.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, Math.sin(enemy.phase) * 0.12);
    if (enemy.visual) {
      enemy.visual.rotor.rotation.y += delta * 48;
      enemy.visual.tailRotor.rotation.y += delta * 72;
    }
    if (engaged && distance < 920 && enemy.cooldown <= 0) {
      enemy.cooldown = 0.72 + Math.random() * 0.9;
      const lead = playerPosition.add(playerVelocity.scale(distance / 260));
      this.callbacks.onFire(enemy.position.add(new Vector3(0, -0.4, 2.5)), lead.subtract(enemy.position), 245);
    }
  }

  private updateGround(enemy: EnemyEntity, delta: number, playerPosition: Vector3, playerVelocity: Vector3) {
    if (enemy.kind === "armour") {
      enemy.position.z += delta * 5.2;
      enemy.position.y = terrainHeight(enemy.position.x, enemy.position.z) + 1.6;
    }
    const distance = Vector3.Distance(enemy.position, playerPosition);
    if (distance < (enemy.kind === "sam" ? 1450 : 720) && enemy.cooldown <= 0) {
      enemy.cooldown = enemy.kind === "sam" ? 2.8 : 1.7;
      const lead = playerPosition.add(playerVelocity.scale(distance / 210));
      this.callbacks.onFire(
        enemy.position.add(new Vector3(0, 2, 0)),
        lead.subtract(enemy.position),
        enemy.kind === "sam" ? 185 : 220,
        enemy.kind === "sam",
      );
    }
  }

}
