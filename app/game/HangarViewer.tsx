"use client";

import { useEffect, useRef, useState } from "react";

type ViewerStatus = "loading" | "ready-high" | "ready-low" | "fallback" | "error";

const STATUS_COPY: Record<ViewerStatus, string> = {
  loading: "Loading AH-64E digital airframe…",
  "ready-high": "High-detail digital airframe online",
  "ready-low": "Performance digital airframe online",
  fallback: "Detailed asset unavailable · safety airframe active",
  error: "3D viewer requires WebGL 2 or WebGPU",
};

export default function HangarViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    let engine: import("@babylonjs/core").Engine | null = null;

    const initialize = async () => {
      try {
        const [babylon, aircraftModule] = await Promise.all([
          import("@babylonjs/core"),
          import("./AircraftFactory"),
        ]);
        if (!active) return;

        const {
          ArcRotateCamera,
          Color3,
          Color4,
          DirectionalLight,
          Engine,
          HemisphericLight,
          MeshBuilder,
          Scene,
          StandardMaterial,
          Vector3,
        } = babylon;

        engine = new Engine(canvas, true, {
          alpha: false,
          antialias: true,
          adaptToDeviceRatio: true,
          powerPreference: "high-performance",
          stencil: true,
        });
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.012, 0.026, 0.028, 1);
        scene.imageProcessingConfiguration.contrast = 1.18;
        scene.imageProcessingConfiguration.exposure = 1.12;

        const camera = new ArcRotateCamera(
          "hangar-orbit-camera",
          Math.PI * 0.34,
          Math.PI * 0.36,
          22.5,
          new Vector3(0, 1.1, 0),
          scene,
        );
        camera.minZ = 0.1;
        camera.lowerRadiusLimit = 13;
        camera.upperRadiusLimit = 31;
        camera.lowerBetaLimit = 0.62;
        camera.upperBetaLimit = 1.46;
        camera.wheelPrecision = 34;
        camera.panningSensibility = 0;
        camera.attachControl(canvas, true);

        const ambient = new HemisphericLight("hangar-ambient", new Vector3(0.1, 1, 0.3), scene);
        ambient.intensity = 1.55;
        ambient.diffuse = new Color3(0.76, 0.88, 0.83);
        ambient.groundColor = new Color3(0.08, 0.11, 0.1);

        const key = new DirectionalLight("hangar-key", new Vector3(-0.7, -1, 0.45), scene);
        key.intensity = 3.2;
        key.diffuse = new Color3(1, 0.93, 0.76);
        const rim = new DirectionalLight("hangar-rim", new Vector3(0.8, -0.45, -0.65), scene);
        rim.intensity = 2.1;
        rim.diffuse = new Color3(0.25, 0.85, 0.78);

        const floor = MeshBuilder.CreateGround("hangar-floor", { width: 38, height: 38 }, scene);
        floor.position.y = -1.16;
        const floorMaterial = new StandardMaterial("hangar-floor-material", scene);
        floorMaterial.diffuseColor = new Color3(0.018, 0.045, 0.046);
        floorMaterial.emissiveColor = new Color3(0.008, 0.022, 0.022);
        floorMaterial.specularColor = new Color3(0.1, 0.16, 0.14);
        floor.material = floorMaterial;

        const pad = MeshBuilder.CreateTorus(
          "hangar-pad-ring",
          { diameter: 17.4, thickness: 0.035, tessellation: 96 },
          scene,
        );
        pad.position.y = -1.13;
        const padMaterial = new StandardMaterial("hangar-pad-material", scene);
        padMaterial.diffuseColor = new Color3(0.55, 0.8, 0.16);
        padMaterial.emissiveColor = new Color3(0.18, 0.28, 0.05);
        pad.material = padMaterial;

        const aircraft = await aircraftModule.createPlayerHelicopter(scene, "hangar-apache", true);
        if (!active) {
          scene.dispose();
          engine.dispose();
          engine = null;
          return;
        }
        setStatus(
          aircraft.assetTier === "high"
            ? "ready-high"
            : aircraft.assetTier === "low"
              ? "ready-low"
              : "fallback",
        );
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        engine.runRenderLoop(() => {
          const delta = Math.min(engine?.getDeltaTime() ?? 16, 50) / 1000;
          aircraft.rotor.rotation.y += delta * 31;
          aircraft.tailRotor.rotation.y += delta * 47;
          if (!reduceMotion) camera.alpha += delta * 0.045;
          scene.render();
        });

        const resize = () => engine?.resize();
        window.addEventListener("resize", resize);
        scene.onDisposeObservable.addOnce(() => window.removeEventListener("resize", resize));
      } catch {
        if (active) setStatus("error");
        engine?.dispose();
        engine = null;
      }
    };

    void initialize();
    return () => {
      active = false;
      engine?.stopRenderLoop();
      engine?.dispose();
      engine = null;
    };
  }, []);

  return (
    <section className={`hangar-viewer status-${status}`} aria-label="Interactive AH-64E 3D model viewer">
      <canvas ref={canvasRef} aria-label="Rotatable three-dimensional AH-64E Apache Guardian model" />
      <div className="hangar-viewer-grid" aria-hidden="true" />
      <div className="hangar-viewer-topline">
        <span>Interactive 3D airframe</span>
        <strong>Drag to orbit · Scroll to zoom</strong>
      </div>
      <div className="hangar-viewer-status" role="status">
        <i />
        {STATUS_COPY[status]}
      </div>
      <div className="hangar-viewer-designation" aria-hidden="true">
        <strong>AH-64E</strong>
        <span>GUARDIAN</span>
      </div>
    </section>
  );
}
