import {
  type AbstractEngine,
  Color3,
  DefaultRenderingPipeline,
  Engine,
  FreeCamera,
  Matrix,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import { AISystem } from "./AISystem";
import { createPlayerHelicopter, type PlayerHelicopterVisual } from "./AircraftFactory";
import { AudioSystem } from "./AudioSystem";
import { CombatSystem } from "./CombatSystem";
import { FLIGHT_GROUND_CLEARANCE_METRES, FlightModel } from "./FlightModel";
import { EMPTY_FLIGHT_DATA, FlightDataComputer } from "./FlightDataComputer";
import { InputManager } from "./InputManager";
import { MissionDirector, type MissionState } from "./MissionDirector";
import type { NetworkSession } from "./NetworkSession";
import type {
  CameraMode,
  CareerProfile,
  CombatUiEventKind,
  FlightDataTelemetry,
  FlightTelemetry,
  GameSettings,
  MissionDefinition,
  MissionResult,
  NetworkFlightState,
  RuntimeCallbacks,
} from "./types";
import {
  createHelicopter,
  terrainHeight,
  WorldBuilder,
  type HelicopterVisual,
} from "./WorldBuilder";

export class GameRuntime {
  private engine: AbstractEngine | null = null;
  private scene: Scene | null = null;
  private camera: FreeCamera | null = null;
  private world: WorldBuilder | null = null;
  private aircraft: PlayerHelicopterVisual | null = null;
  private remoteAircraft: HelicopterVisual | null = null;
  private remoteState: NetworkFlightState | null = null;
  private input: InputManager | null = null;
  private combat: CombatSystem | null = null;
  private ai: AISystem | null = null;
  private director: MissionDirector | null = null;
  private missionState: MissionState;
  private readonly flight: FlightModel;
  private readonly flightDataComputer = new FlightDataComputer();
  private flightData: FlightDataTelemetry = { ...EMPTY_FLIGHT_DATA };
  private readonly audio = new AudioSystem();
  private readonly maxHull: number;
  private cameraMode: CameraMode = "chase";
  private paused = false;
  private disposed = false;
  private lastFrame = performance.now();
  private accumulator = 0;
  private hudAccumulator = 0;
  private networkAccumulator = 0;
  private cannonCooldown = 0;
  private secondaryCooldown = 0;
  private cameraLookX = 0;
  private cameraLookY = 0;
  private quality: "low" | "high" = "high";
  private lastInputDevice: FlightTelemetry["inputDevice"] = "keyboard-mouse";
  private flightTime = 0;
  private kills = 0;
  private score = 0;
  private resultSent = false;
  private completionDelay = 0;
  private combatEventId = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mission: MissionDefinition,
    private readonly settings: GameSettings,
    private readonly career: CareerProfile,
    private readonly callbacks: RuntimeCallbacks,
    private readonly network?: NetworkSession,
  ) {
    this.flight = new FlightModel(settings, career.upgrades.engine);
    this.maxHull = 100 + career.upgrades.armour * 12;
    this.flight.hull = this.maxHull;
    this.missionState = {
      objective: mission.objective,
      detail: "Follow the navigation marker",
      progress: 0,
      completed: false,
      phase: "nav",
      waypoint: null,
      holdRemaining: 0,
    };
  }

  async initialize() {
    try {
      this.engine = await this.createEngine();
      this.quality = this.pickQuality();
      this.scene = new Scene(this.engine);
      this.scene.skipPointerMovePicking = true;
      this.camera = new FreeCamera("flight-camera", new Vector3(0, 95, 138), this.scene);
      this.camera.minZ = 0.2;
      this.camera.maxZ = 16000;
      this.camera.fov = 0.92;
      this.world = await WorldBuilder.create(
        this.scene,
        this.mission,
        this.quality === "high",
        this.settings,
        this.callbacks.onNotice,
      );
      const departureElevation = terrainHeight(0, 120);
      this.flight.position.y = departureElevation + FLIGHT_GROUND_CLEARANCE_METRES;
      this.camera.position.y = departureElevation + 9.5;
      this.aircraft = await createPlayerHelicopter(
        this.scene,
        "player",
        this.quality === "high",
      );
      this.aircraft.root.position.copyFrom(this.flight.position);
      this.aircraft.root.rotationQuaternion = this.flight.rotation.clone();
      for (const mesh of this.aircraft.shadowMeshes) this.world.shadow.addShadowCaster(mesh, true);

      this.remoteAircraft = createHelicopter(this.scene, "wingman", new Color3(0.08, 0.22, 0.3));
      this.remoteAircraft.root.setEnabled(false);
      for (const mesh of this.remoteAircraft.shadowMeshes) this.world.shadow.addShadowCaster(mesh, true);

      this.combat = new CombatSystem(
        this.scene,
        {
          onPlayerDamage: (amount, source, origin) => this.damagePlayer(amount, source, origin),
          onTargetHit: (event) => {
            this.audio.hitConfirm(event.destroyed);
            const kind: CombatUiEventKind = event.destroyed
              ? "kill"
              : event.healthPercent <= 28
                ? "critical"
                : "hit";
            this.emitCombatEvent(
              kind,
              event.destroyed ? "TARGET DESTROYED" : kind === "critical" ? "CRITICAL HIT" : "HIT CONFIRMED",
              event.damage,
            );
          },
          onExplosion: (position, intensity) => {
            this.audio.explosion(intensity);
            if (Vector3.Distance(position, this.flight.position) < 120) {
              void this.input?.pulse(Math.min(1, intensity * 0.7), 0.5, 160);
            }
          },
          onNotice: this.callbacks.onNotice,
        },
        this.career.upgrades.weapons,
        this.career.upgrades.sensors,
      );
      this.ai = new AISystem(this.scene, this.world, this.mission, {
        onFire: (origin, direction, speed, guided) => this.combat?.fireEnemy(origin, direction, speed, guided),
        onDestroyed: (enemy) => {
          this.combat?.explode(enemy.position, enemy.kind === "helicopter" ? 1.25 : 0.9);
          this.kills += 1;
          this.score += enemy.kind === "sam" ? 1250 : enemy.kind === "helicopter" ? 1000 : 650;
          this.callbacks.onNotice(`${enemy.name} destroyed`);
        },
      });
      this.director = new MissionDirector(this.mission);
      this.bindNetwork();
      this.network?.sendEvent("notice", { missionId: this.mission.id });

      if (this.quality === "high") {
        const pipeline = new DefaultRenderingPipeline(
          "cinematic-pipeline",
          true,
          this.scene,
          [this.camera],
        );
        pipeline.fxaaEnabled = true;
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.86;
        pipeline.bloomWeight = 0.24;
        pipeline.imageProcessing.contrast = 1.18;
        pipeline.imageProcessing.exposure = 1.04;
      }

      this.createNavigationLights();
      this.input = new InputManager(this.canvas, this.settings);
      await this.audio.start(this.settings.masterVolume);
      this.engine.runRenderLoop(this.renderFrame);
      window.addEventListener("resize", this.onResize);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.callbacks.onNotice(
        `${this.engine.name.toUpperCase()} · ${this.quality.toUpperCase()} · ${this.aircraft.assetTier === "procedural" ? "SAFETY AIRFRAME" : `AH-64E ${this.aircraft.assetTier.toUpperCase()} LOD`} · ${this.world.terrainLabel}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to initialize the 3D engine.";
      this.callbacks.onFatal(message);
      throw error;
    }
  }

  setPaused(next: boolean) {
    this.paused = next;
    if (next) {
      this.audio.suspend();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } else {
      this.audio.resume();
      this.lastFrame = performance.now();
    }
    this.callbacks.onPause(next);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.input?.dispose();
    this.combat?.dispose();
    this.ai?.dispose();
    this.audio.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    if (this.network) {
      this.network.onRemoteState = () => undefined;
      this.network.onEvent = () => undefined;
    }
  }

  private async createEngine(): Promise<AbstractEngine> {
    const canUseWebGpu = "gpu" in navigator && this.settings.quality !== "low";
    if (canUseWebGpu) {
      try {
        const engine = new WebGPUEngine(this.canvas, {
          antialias: true,
          adaptToDeviceRatio: true,
        });
        await engine.initAsync();
        return engine;
      } catch {
        this.callbacks.onNotice("WebGPU unavailable — using WebGL 2");
      }
    }
    return new Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: "high-performance",
      adaptToDeviceRatio: true,
    });
  }

  private pickQuality(): "low" | "high" {
    if (this.settings.quality !== "auto") return this.settings.quality;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    return memory >= 6 && cores >= 6 ? "high" : "low";
  }

  private renderFrame = () => {
    if (
      this.disposed ||
      !this.scene ||
      !this.engine ||
      !this.input ||
      !this.world ||
      !this.aircraft ||
      !this.camera
    )
      return;
    const now = performance.now();
    const frameDelta = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    if (this.input.consume("pause")) this.setPaused(!this.paused);
    if (this.input.consume("camera")) this.cycleCamera();
    if (this.input.consume("weapon")) this.combat?.cycleWeapon();
    if (this.input.consume("target")) {
      const forward = Vector3.Forward().applyRotationQuaternion(this.flight.rotation);
      this.combat?.cycleTarget(this.ai?.targets ?? [], {
        position: this.flight.position,
        forward,
      });
    }
    if (this.input.consume("hover")) {
      this.flight.hoverAssist = !this.flight.hoverAssist;
      this.callbacks.onNotice(
        `Hover assist ${this.flight.hoverAssist ? "engaged" : "disengaged"}`,
      );
    }

    if (!this.paused) {
      this.accumulator = Math.min(this.accumulator + frameDelta, 0.2);
      while (this.accumulator >= 1 / 60) {
        this.fixedUpdate(1 / 60);
        this.accumulator -= 1 / 60;
      }
      this.updateCamera(frameDelta);
      this.updateRemoteAircraft(frameDelta);
      this.world.update(frameDelta, this.flight.position);
      this.hudAccumulator += frameDelta;
      if (this.hudAccumulator >= 0.08) {
        this.hudAccumulator = 0;
        this.callbacks.onTelemetry(this.telemetry());
      }
    }
    this.scene.render();
  };

  private fixedUpdate(delta: number) {
    if (!this.input || !this.world || !this.aircraft || !this.combat || !this.ai || !this.director)
      return;
    this.flightTime += delta;
    const controls = this.input.read();
    this.lastInputDevice = controls.device;
    const ground = terrainHeight(this.flight.position.x, this.flight.position.z);
    const result = this.flight.step(delta, controls, terrainHeight, this.world.wind);
    this.aircraft.root.position.copyFrom(this.flight.position);
    this.aircraft.root.rotationQuaternion?.copyFrom(this.flight.rotation);
    this.aircraft.rotor.rotation.y += delta * (15 + this.flight.rotorRpm * 42);
    this.aircraft.tailRotor.rotation.y += delta * (22 + this.flight.rotorRpm * 68);
    this.cameraLookX += (controls.lookX - this.cameraLookX) * delta * 4;
    this.cameraLookY += (controls.lookY - this.cameraLookY) * delta * 4;
    this.audio.update(this.flight.rotorRpm, this.flight.collective, this.flight.airspeed);

    const forward = Vector3.Forward().applyRotationQuaternion(this.flight.rotation);
    const up = Vector3.Up().applyRotationQuaternion(this.flight.rotation);
    const muzzle = this.flight.position.add(forward.scale(3.2)).subtract(up.scale(0.38));
    this.ai.update(delta, this.flight.position, this.flight.velocity);
    this.combat.updateSensors(delta, {
      position: this.flight.position,
      velocity: this.flight.velocity,
      forward,
    }, this.ai.targets);
    this.cannonCooldown -= delta;
    this.secondaryCooldown -= delta;
    if (controls.firePrimary && this.cannonCooldown <= 0) {
      this.cannonCooldown = 0.096;
      if (this.combat.fireCannon(muzzle, forward, this.flight.velocity)) {
        this.audio.shot();
        void this.input.pulse(0.18, 0.38, 45);
        this.network?.sendEvent("cannon", {
          position: [muzzle.x, muzzle.y, muzzle.z],
          direction: [forward.x, forward.y, forward.z],
        });
      }
    }
    if (controls.fireSecondary && this.secondaryCooldown <= 0) {
      const fired = this.combat.fireSecondary(
        muzzle.add(forward.scale(1.2)),
        forward,
        this.flight.velocity,
        this.ai.targets,
      );
      if (fired) {
        this.secondaryCooldown = this.combat.selectedWeapon === "hellfire" ? 1.7 : 0.32;
        this.audio.rocket(this.combat.selectedWeapon);
        void this.input.pulse(0.5, 0.35, 120);
        this.network?.sendEvent(
          this.combat.selectedWeapon === "hellfire" ? "missile" : "rocket",
          {
            position: [muzzle.x, muzzle.y, muzzle.z],
            direction: [forward.x, forward.y, forward.z],
            targetId: this.combat.selectedTargetId,
          },
        );
      }
    }

    this.combat.update(delta, this.flight.position, this.ai.targets);

    if (result.hardLanding) {
      this.audio.impact(Math.min(1, result.impact / 12));
      void this.input.pulse(Math.min(1, result.impact / 12), 0.7, 180);
      this.callbacks.onNotice(
        result.impact > 9 ? "Hard impact — systems damaged" : "Hard landing",
      );
      this.emitCombatEvent(
        "impact",
        result.impact > 9 ? "HARD IMPACT · SYSTEM DAMAGE" : "HARD LANDING",
        Math.round(result.impact),
      );
    }

    this.missionState = this.director.update(delta, {
      playerPosition: this.flight.position,
      speed: this.flight.velocity.length(),
      radarAltitude: Math.max(0, this.flight.position.y - ground),
      destroyedAir: this.ai.destroyedAir,
      destroyedGround: this.ai.destroyedGround,
      remainingEnemies: this.ai.remainingEnemies,
    });
    const currentGround = terrainHeight(this.flight.position.x, this.flight.position.z);
    this.flightData = this.flightDataComputer.update(delta, {
      position: this.flight.position,
      velocity: this.flight.velocity,
      rotation: this.flight.rotation,
      wind: this.world.wind,
      heading: this.flight.heading,
      pitch: this.flight.pitch,
      roll: this.flight.roll,
      yawRate: this.flight.yawRate,
      collective: this.flight.collective,
      rotorRpm: this.flight.rotorRpm,
      engine: this.flight.engine,
      fuel: this.flight.fuel,
      radarAltitudeMetres: Math.max(
        0,
        this.flight.position.y - currentGround - FLIGHT_GROUND_CLEARANCE_METRES,
      ),
      waypoint: this.missionState.waypoint,
    });
    if (this.missionState.completed) {
      this.completionDelay += delta;
      if (this.completionDelay > 2) this.finishMission(true);
    }
    if (this.flight.hull <= 0) this.finishMission(false);

    this.networkAccumulator += delta;
    if (this.networkAccumulator >= 1 / 15) {
      this.networkAccumulator = 0;
      this.network?.sendState({
        position: [this.flight.position.x, this.flight.position.y, this.flight.position.z],
        rotation: [
          this.flight.rotation.x,
          this.flight.rotation.y,
          this.flight.rotation.z,
          this.flight.rotation.w,
        ],
        velocity: [this.flight.velocity.x, this.flight.velocity.y, this.flight.velocity.z],
        rotorRpm: this.flight.rotorRpm,
        hull: (this.flight.hull / this.maxHull) * 100,
        timestamp: performance.now(),
      });
    }
  }

  private updateCamera(delta: number) {
    if (!this.camera || !this.aircraft) return;
    const forward = Vector3.Forward().applyRotationQuaternion(this.flight.rotation);
    const up = Vector3.Up().applyRotationQuaternion(this.flight.rotation);
    let desiredPosition: Vector3;
    let target: Vector3;
    if (this.cameraMode === "cockpit") {
      desiredPosition = this.flight.position.add(up.scale(0.48)).add(forward.scale(1.42));
      target = desiredPosition
        .add(forward.scale(240))
        .add(new Vector3(this.cameraLookX * 35, -this.cameraLookY * 24, 0));
      this.aircraft.root.setEnabled(false);
    } else if (this.cameraMode === "cinematic") {
      const orbit = performance.now() * 0.00013;
      desiredPosition = this.flight.position.add(
        new Vector3(Math.sin(orbit) * 30, 12, Math.cos(orbit) * 30),
      );
      target = this.flight.position.add(forward.scale(6));
      this.aircraft.root.setEnabled(true);
    } else {
      desiredPosition = this.flight.position
        .subtract(forward.scale(24))
        .add(up.scale(8.5))
        .add(new Vector3(this.cameraLookX * 4, this.cameraLookY * -3, 0));
      target = this.flight.position.add(forward.scale(19)).add(up.scale(1.2));
      this.aircraft.root.setEnabled(true);
    }
    const smoothing = 1 - Math.exp(-delta * (this.cameraMode === "cockpit" ? 16 : 6.5));
    this.camera.position.copyFrom(
      Vector3.Lerp(this.camera.position, desiredPosition, smoothing),
    );
    this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(), target, smoothing));
  }

  private cycleCamera() {
    const modes: CameraMode[] = ["chase", "cockpit", "cinematic"];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    this.callbacks.onNotice(`${this.cameraMode} camera`);
  }

  private telemetry(): FlightTelemetry {
    const ground = terrainHeight(this.flight.position.x, this.flight.position.z);
    const hours = Math.floor(this.world?.timeOfDay ?? 0);
    const minutes = Math.floor(((this.world?.timeOfDay ?? 0) % 1) * 60);
    const target = this.combat?.targetInfo();
    const targetScreen = this.projectHudPoint(target?.position ?? null);
    const leadScreen = this.projectHudPoint(target?.leadPoint ?? null);
    return {
      altitude: this.flight.position.y * 3.28084,
      radarAltitude: Math.max(
        0,
        (this.flight.position.y - ground - FLIGHT_GROUND_CLEARANCE_METRES) * 3.28084,
      ),
      airspeed: this.flightData.trueAirspeed,
      verticalSpeed: this.flightData.verticalSpeed,
      heading: this.flight.heading,
      collective: this.flight.collective * 100,
      rotorRpm: this.flight.rotorRpm * 100,
      fuel: this.flight.fuel,
      hull: (this.flight.hull / this.maxHull) * 100,
      engine: this.flight.engine,
      positionX: this.flight.position.x,
      positionZ: this.flight.position.z,
      camera: this.cameraMode,
      inputDevice: this.lastInputDevice,
      hoverAssist: this.flight.hoverAssist,
      fps: this.engine?.getFps() ?? 0,
      time: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
      weather: this.world?.weather ?? this.mission.weather,
      missionTitle: this.mission.callsign,
      objective: this.missionState.objective,
      objectiveProgress: this.missionState.progress,
      objectiveDetail: this.missionState.detail,
      missionPhase: this.missionState.phase,
      cannonAmmo: this.combat?.cannonAmmo ?? 0,
      rockets: this.combat?.rockets ?? 0,
      missiles: this.combat?.missiles ?? 0,
      selectedWeapon: this.combat?.selectedWeapon ?? "hydra",
      targetName: target?.name ?? "NO TARGET",
      targetDistance: target?.distance ?? 0,
      targetKind: target?.kind ?? "none",
      targetState: target?.state ?? "none",
      targetQuality: (target?.quality ?? 0) * 100,
      targetHealth: target?.healthPercent ?? 0,
      targetClosure: target?.closureRate ?? 0,
      targetBearing: target?.bearing ?? 0,
      targetRelativeBearing: target?.relativeBearing ?? 0,
      targetElevation: target?.elevation ?? 0,
      targetLineOfSight: target?.lineOfSight ?? false,
      targetVisible: targetScreen.visible,
      targetScreenX: targetScreen.x,
      targetScreenY: targetScreen.y,
      leadVisible: leadScreen.visible && (target?.quality ?? 0) >= 0.28,
      leadScreenX: leadScreen.x,
      leadScreenY: leadScreen.y,
      flightData: { ...this.flightData },
      threatLevel: this.combat?.threatLevel ?? "clear",
      kills: this.kills,
      score: this.score,
      networkStatus: this.network?.status ?? "offline",
      terrainSource: this.world?.terrainSource ?? "procedural",
    };
  }

  private projectHudPoint(point: Vector3 | null) {
    if (!point || !this.camera || !this.scene || !this.engine) {
      return { x: 50, y: 50, visible: false };
    }
    const width = Math.max(1, this.engine.getRenderWidth());
    const height = Math.max(1, this.engine.getRenderHeight());
    const viewport = this.camera.viewport.toGlobal(width, height);
    const projected = Vector3.Project(
      point,
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      viewport,
    );
    const x = projected.x / width * 100;
    const y = projected.y / height * 100;
    return {
      x,
      y,
      visible: projected.z > 0 && projected.z < 1 && x > 1.5 && x < 98.5 && y > 2 && y < 98,
    };
  }

  private damagePlayer(amount: number, source: string, origin: Vector3) {
    const mitigation = 1 - this.career.upgrades.armour * 0.075;
    this.flight.hull = Math.max(0, this.flight.hull - amount * mitigation);
    this.flight.engine = Math.max(20, this.flight.engine - amount * 0.08);
    this.audio.impact(Math.min(1, amount / 16));
    void this.input?.pulse(Math.min(1, amount / 12), 0.65, 130);
    this.callbacks.onNotice(`Hit by ${source}`);
    const sourceDirection = origin.subtract(this.flight.position).normalize();
    const forward = Vector3.Forward().applyRotationQuaternion(this.flight.rotation);
    const right = Vector3.Right().applyRotationQuaternion(this.flight.rotation);
    const direction = Math.atan2(
      Vector3.Dot(sourceDirection, right),
      Vector3.Dot(sourceDirection, forward),
    ) * 180 / Math.PI;
    this.emitCombatEvent("damaged", "INCOMING HIT", Math.round(amount), direction);
  }

  private emitCombatEvent(
    kind: CombatUiEventKind,
    label: string,
    damage?: number,
    direction?: number,
  ) {
    this.combatEventId += 1;
    this.callbacks.onCombatEvent({
      id: this.combatEventId,
      kind,
      label,
      damage,
      direction,
    });
  }

  private finishMission(success: boolean) {
    if (this.resultSent) return;
    this.resultSent = true;
    this.paused = true;
    this.audio.suspend();
    const hullBonus = Math.round((this.flight.hull / this.maxHull) * 2200);
    const timeBonus = Math.max(0, Math.round(2400 - this.flightTime * 5));
    const score = Math.max(0, this.score + hullBonus + timeBonus + (success ? 6000 : 0));
    const rating: MissionResult["rating"] =
      score >= 10500 ? "S" : score >= 7600 ? "A" : score >= 4800 ? "B" : "C";
    this.callbacks.onMissionComplete({
      success,
      missionId: this.mission.id,
      score,
      kills: this.kills,
      credits: success ? 1800 + this.kills * 180 : 300 + this.kills * 80,
      xp: success ? 900 + this.kills * 120 : 180 + this.kills * 60,
      flightTime: this.flightTime,
      rating,
    });
  }

  private bindNetwork() {
    if (!this.network) return;
    this.network.onRemoteState = (state) => {
      this.remoteState = state;
      this.remoteAircraft?.root.setEnabled(true);
    };
    this.network.onEvent = (event) => {
      if (event.name === "notice") {
        const remoteMission = this.readString(event.payload?.missionId);
        if (remoteMission && remoteMission !== this.mission.id) {
          this.callbacks.onNotice("Wingman launched a different operation");
        }
        return;
      }
      const position = this.readVector(event.payload?.position);
      const direction = this.readVector(event.payload?.direction);
      if (!position || !direction || !this.combat) return;
      if (event.name === "cannon") {
        this.combat.fireCannon(position, direction, Vector3.Zero(), "remote");
      } else {
        this.combat.fireRemoteSecondary(
          event.name === "missile" ? "hellfire" : "hydra",
          position,
          direction,
          this.readString(event.payload?.targetId) ?? undefined,
        );
      }
    };
  }

  private updateRemoteAircraft(delta: number) {
    if (!this.remoteAircraft || !this.remoteState) return;
    const desiredPosition = new Vector3(...this.remoteState.position);
    const desiredRotation = new Quaternion(...this.remoteState.rotation);
    const smoothing = 1 - Math.exp(-delta * 9);
    this.remoteAircraft.root.position.copyFrom(
      Vector3.Lerp(this.remoteAircraft.root.position, desiredPosition, smoothing),
    );
    this.remoteAircraft.root.rotationQuaternion ??= Quaternion.Identity();
    Quaternion.SlerpToRef(
      this.remoteAircraft.root.rotationQuaternion,
      desiredRotation,
      smoothing,
      this.remoteAircraft.root.rotationQuaternion,
    );
    this.remoteAircraft.rotor.rotation.y += delta * (18 + this.remoteState.rotorRpm * 44);
    this.remoteAircraft.tailRotor.rotation.y += delta * (25 + this.remoteState.rotorRpm * 70);
  }

  private readVector(value: unknown) {
    if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number"))
      return null;
    return new Vector3(value[0] as number, value[1] as number, value[2] as number);
  }

  private readString(value: unknown) {
    return typeof value === "string" ? value : null;
  }

  private createNavigationLights() {
    if (!this.scene || !this.aircraft) return;
    for (const [name, x, color] of [
      ["port", -1.3, new Color3(1, 0.05, 0.05)],
      ["starboard", 1.3, new Color3(0.05, 1, 0.25)],
    ] as const) {
      const light = MeshBuilder.CreateSphere(name, { diameter: 0.12 }, this.scene);
      light.parent = this.aircraft.root;
      light.position.set(x, 0, 0.2);
      const navigationMaterial = new StandardMaterial(`${name}-material`, this.scene);
      navigationMaterial.emissiveColor = color;
      navigationMaterial.disableLighting = true;
      light.material = navigationMaterial;
    }
  }

  private onResize = () => this.engine?.resize();
  private onVisibilityChange = () => {
    if (document.hidden && !this.paused) this.setPaused(true);
  };
}
