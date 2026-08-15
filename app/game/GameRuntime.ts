import {
  type AbstractEngine,
  Color3,
  DefaultRenderingPipeline,
  Engine,
  FreeCamera,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import { AudioSystem } from "./AudioSystem";
import { FlightModel } from "./FlightModel";
import { InputManager } from "./InputManager";
import type { CameraMode, FlightTelemetry, GameSettings, MissionDefinition, RuntimeCallbacks } from "./types";
import { createHelicopter, terrainHeight, WorldBuilder, type HelicopterVisual } from "./WorldBuilder";

export class GameRuntime {
  private engine: AbstractEngine | null = null;
  private scene: Scene | null = null;
  private camera: FreeCamera | null = null;
  private world: WorldBuilder | null = null;
  private aircraft: HelicopterVisual | null = null;
  private input: InputManager | null = null;
  private readonly flight: FlightModel;
  private readonly audio = new AudioSystem();
  private cameraMode: CameraMode = "chase";
  private paused = false;
  private disposed = false;
  private lastFrame = performance.now();
  private accumulator = 0;
  private hudAccumulator = 0;
  private missionProgress = 0;
  private cannonCooldown = 0;
  private cameraLookX = 0;
  private cameraLookY = 0;
  private quality: "low" | "high" = "high";
  private lastInputDevice: FlightTelemetry["inputDevice"] = "keyboard-mouse";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mission: MissionDefinition,
    private readonly settings: GameSettings,
    private readonly callbacks: RuntimeCallbacks,
  ) {
    this.flight = new FlightModel(settings);
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
      this.world = new WorldBuilder(this.scene, this.mission, this.quality === "high");
      this.aircraft = createHelicopter(this.scene, "player");
      this.aircraft.root.position.copyFrom(this.flight.position);
      this.aircraft.root.rotationQuaternion = this.flight.rotation.clone();
      for (const mesh of this.aircraft.shadowMeshes) this.world.shadow.addShadowCaster(mesh);

      if (this.quality === "high") {
        const pipeline = new DefaultRenderingPipeline("cinematic-pipeline", true, this.scene, [this.camera]);
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
      this.callbacks.onNotice(`${this.engine.name.toUpperCase()} renderer · ${this.quality.toUpperCase()} quality`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initialize the 3D engine.";
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
    this.audio.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
  }

  private async createEngine(): Promise<AbstractEngine> {
    const canUseWebGpu = "gpu" in navigator && this.settings.quality !== "low";
    if (canUseWebGpu) {
      try {
        const engine = new WebGPUEngine(this.canvas, { antialias: true, adaptToDeviceRatio: true });
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
    if (this.disposed || !this.scene || !this.engine || !this.input || !this.world || !this.aircraft || !this.camera) return;
    const now = performance.now();
    const frameDelta = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    if (this.input.consume("pause")) this.setPaused(!this.paused);
    if (this.input.consume("camera")) this.cycleCamera();
    if (this.input.consume("hover")) {
      this.flight.hoverAssist = !this.flight.hoverAssist;
      this.callbacks.onNotice(`Hover assist ${this.flight.hoverAssist ? "engaged" : "disengaged"}`);
    }

    if (!this.paused) {
      this.accumulator = Math.min(this.accumulator + frameDelta, 0.2);
      while (this.accumulator >= 1 / 60) {
        this.fixedUpdate(1 / 60);
        this.accumulator -= 1 / 60;
      }
      this.updateCamera(frameDelta);
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
    if (!this.input || !this.world || !this.aircraft) return;
    const controls = this.input.read();
    this.lastInputDevice = controls.device;
    const ground = terrainHeight(this.flight.position.x, this.flight.position.z);
    const result = this.flight.step(delta, controls, ground, this.world.wind);
    this.aircraft.root.position.copyFrom(this.flight.position);
    this.aircraft.root.rotationQuaternion?.copyFrom(this.flight.rotation);
    this.aircraft.rotor.rotation.y += delta * (15 + this.flight.rotorRpm * 42);
    this.aircraft.tailRotor.rotation.y += delta * (22 + this.flight.rotorRpm * 68);
    this.cameraLookX += (controls.lookX - this.cameraLookX) * delta * 4;
    this.cameraLookY += (controls.lookY - this.cameraLookY) * delta * 4;
    this.audio.update(this.flight.rotorRpm, this.flight.collective, this.flight.airspeed);

    this.cannonCooldown -= delta;
    if (controls.firePrimary && this.cannonCooldown <= 0) {
      this.cannonCooldown = 0.085;
      this.audio.shot();
      void this.input.pulse(0.18, 0.38, 45);
    }

    if (result.hardLanding) {
      this.audio.impact(Math.min(1, result.impact / 12));
      void this.input.pulse(Math.min(1, result.impact / 12), 0.7, 180);
      this.callbacks.onNotice(result.impact > 9 ? "Hard impact — systems damaged" : "Hard landing");
    }

    const distance = Vector3.Distance(this.flight.position, this.objectivePoint());
    this.missionProgress = Math.max(this.missionProgress, 1 - Math.min(1, distance / 3600));
    if (distance < 130 && this.missionProgress < 1) {
      this.missionProgress = 1;
      this.callbacks.onNotice("Objective area reached — hold position");
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
      target = desiredPosition.add(forward.scale(240)).add(new Vector3(this.cameraLookX * 35, -this.cameraLookY * 24, 0));
      this.aircraft.root.setEnabled(false);
    } else if (this.cameraMode === "cinematic") {
      const orbit = performance.now() * 0.00013;
      desiredPosition = this.flight.position.add(new Vector3(Math.sin(orbit) * 30, 12, Math.cos(orbit) * 30));
      target = this.flight.position.add(forward.scale(6));
      this.aircraft.root.setEnabled(true);
    } else {
      desiredPosition = this.flight.position.subtract(forward.scale(24)).add(up.scale(8.5)).add(new Vector3(this.cameraLookX * 4, this.cameraLookY * -3, 0));
      target = this.flight.position.add(forward.scale(19)).add(up.scale(1.2));
      this.aircraft.root.setEnabled(true);
    }
    const smoothing = 1 - Math.exp(-delta * (this.cameraMode === "cockpit" ? 16 : 6.5));
    this.camera.position.copyFrom(Vector3.Lerp(this.camera.position, desiredPosition, smoothing));
    this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(), target, smoothing));
  }

  private cycleCamera() {
    const modes: CameraMode[] = ["chase", "cockpit", "cinematic"];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    this.callbacks.onNotice(`${this.cameraMode} camera`);
  }

  private objectivePoint() {
    if (this.mission.id === "first-light") return new Vector3(-1650, 80, -1430);
    if (this.mission.id === "broken-spear") return new Vector3(1820, 80, 1020);
    return new Vector3(1240, 70, 2660);
  }

  private telemetry(): FlightTelemetry {
    const ground = terrainHeight(this.flight.position.x, this.flight.position.z);
    const hours = Math.floor(this.world?.timeOfDay ?? 0);
    const minutes = Math.floor(((this.world?.timeOfDay ?? 0) % 1) * 60);
    return {
      altitude: this.flight.position.y * 3.28084,
      radarAltitude: Math.max(0, (this.flight.position.y - ground - 1.7) * 3.28084),
      airspeed: this.flight.airspeed,
      verticalSpeed: this.flight.verticalSpeed,
      heading: this.flight.heading,
      collective: this.flight.collective * 100,
      rotorRpm: this.flight.rotorRpm * 100,
      fuel: this.flight.fuel,
      hull: this.flight.hull,
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
      objective: this.mission.objective,
      objectiveProgress: this.missionProgress,
    };
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
