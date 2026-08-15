"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTROL_REFERENCE, DEFAULT_SETTINGS, MISSIONS } from "./config";
import { GameRuntime } from "./GameRuntime";
import type { FlightTelemetry, GamePhase, GameSettings, MissionDefinition } from "./types";

const EMPTY_TELEMETRY: FlightTelemetry = {
  altitude: 0,
  radarAltitude: 0,
  airspeed: 0,
  verticalSpeed: 0,
  heading: 0,
  collective: 0,
  rotorRpm: 0,
  fuel: 100,
  hull: 100,
  engine: 100,
  positionX: 0,
  positionZ: 0,
  camera: "chase",
  inputDevice: "keyboard-mouse",
  hoverAssist: true,
  fps: 0,
  time: "--:--",
  weather: "clear",
  missionTitle: "",
  objective: "",
  objectiveProgress: 0,
};

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [mission, setMission] = useState<MissionDefinition>(MISSIONS[0]);
  const [telemetry, setTelemetry] = useState(EMPTY_TELEMETRY);
  const [notice, setNotice] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [showControls, setShowControls] = useState(false);
  const [settings] = useState<GameSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("rotorfrontier.settings") ?? "{}") };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const pushNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 2600);
  }, []);

  const launch = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || runtimeRef.current) return;
    setFatalError("");
    setPhase("loading");
    const runtime = new GameRuntime(canvas, mission, settings, {
      onTelemetry: setTelemetry,
      onPause: (paused) => setPhase(paused ? "paused" : "playing"),
      onNotice: pushNotice,
      onFatal: setFatalError,
    });
    runtimeRef.current = runtime;
    try {
      await runtime.initialize();
      setPhase("playing");
      pushNotice(`${mission.callsign} · flight systems online`);
      void canvas.requestPointerLock();
    } catch {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setPhase("menu");
    }
  }, [mission, pushNotice, settings]);

  const returnToMenu = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setTelemetry(EMPTY_TELEMETRY);
    setPhase("menu");
    setNotice("");
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    runtimeRef.current?.dispose();
  }, []);

  const compass = useMemo(() => Math.round(telemetry.heading).toString().padStart(3, "0"), [telemetry.heading]);

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="RotorFrontier 3D flight view" />

      {phase === "menu" || phase === "loading" ? (
        <section className="menu-backdrop" aria-label="Mission briefing">
          <div className="menu-shell">
            <div>
              <div className="brand-lockup">
                <div className="brand-icon" aria-hidden="true"><span>RF</span></div>
                <div>
                  <div className="brand-name">RotorFrontier</div>
                  <div className="brand-build">Flight systems · Milestone 01</div>
                </div>
              </div>

              <p className="eyebrow">Tactical helicopter operations</p>
              <h1 className="menu-title">Own the <span>vertical</span></h1>
              <p className="menu-copy">
                A physics-driven browser flight experience. Manage collective,
                cyclic, rotor energy, terrain, wind and visibility across a live
                eight-kilometre battlespace.
              </p>

              <div className="mission-selector" aria-label="Select operation">
                {MISSIONS.map((item) => (
                  <button
                    key={item.id}
                    className={`mission-card ${mission.id === item.id ? "selected" : ""}`}
                    onClick={() => setMission(item)}
                    aria-pressed={mission.id === item.id}
                  >
                    <span className="mission-index">OP {item.index}</span>
                    <span>
                      <strong>{item.callsign}</strong>
                      <small>{item.location}</small>
                    </span>
                    <span className="mission-risk">{item.risk}</span>
                  </button>
                ))}
              </div>

              <div className="menu-actions">
                <button className="primary-action" onClick={() => void launch()} disabled={phase === "loading"}>
                  {phase === "loading" ? "Initializing…" : "Launch operation"}
                </button>
                <button className="secondary-action" onClick={() => setShowControls(true)}>
                  Flight controls
                </button>
              </div>
              {fatalError ? <div className="error-box">{fatalError}</div> : null}
            </div>

            <aside className="system-strip" aria-label="System readiness">
              <h2>Platform readiness</h2>
              <div className="system-row"><span>Renderer</span><output>WebGPU / WebGL 2</output></div>
              <div className="system-row"><span>Input bus</span><output>Mouse · Keys · Gamepad</output></div>
              <div className="system-row"><span>Flight model</span><output>60 Hz fixed-step</output></div>
              <div className="system-row"><span>World</span><output>8.2 km procedural</output></div>
              <div className="system-row"><span>Operation weather</span><output>{mission.weather}</output></div>
            </aside>
          </div>
        </section>
      ) : null}

      {phase === "playing" || phase === "paused" ? (
        <>
          <section className="hud" aria-label="Flight instruments">
            <div className="hud-top">
              <span>{telemetry.missionTitle}</span>
              <strong>HDG {compass}</strong>
              <span>{telemetry.time} local</span>
              <span>{telemetry.weather}</span>
            </div>

            <div className="hud-left">
              <HudMetric label="Airspeed" value={telemetry.airspeed} unit="KT" />
              <HudMetric label="Altitude MSL" value={telemetry.altitude} unit="FT" />
              <HudMetric label="Radar altitude" value={telemetry.radarAltitude} unit="FT" />
              <HudMetric label="Vertical speed" value={telemetry.verticalSpeed} unit="FPM" />
            </div>

            <div className="hud-right">
              <div className="hud-panel">
                <span className="hud-label">Primary objective</span>
                <strong className="hud-value" style={{ fontSize: "0.76rem", letterSpacing: "0.02em" }}>
                  {telemetry.objective}
                </strong>
                <div className="health-line"><span style={{ width: `${telemetry.objectiveProgress * 100}%` }} /></div>
              </div>
              <StatusMetric label="Hull integrity" value={telemetry.hull} />
              <StatusMetric label="Engine" value={telemetry.engine} />
              <StatusMetric label="Fuel" value={telemetry.fuel} />
              <div className="hud-panel">
                <span className="hud-label">Rotor / Collective</span>
                <strong className="hud-value">
                  {Math.round(telemetry.rotorRpm)} / {Math.round(telemetry.collective)}<small>%</small>
                </strong>
              </div>
            </div>

            <div className="reticle" aria-hidden="true"><span className="reticle-notch" /></div>

            <div className="hud-bottom">
              <div className="weapon-chip">M230 · SAFE TRAINING</div>
              <div className={`assist-chip ${telemetry.hoverAssist ? "active" : ""}`}>
                Hover assist {telemetry.hoverAssist ? "ON" : "OFF"}
              </div>
            </div>

            {notice ? <div className="toast-stack" aria-live="polite"><div className="toast">{notice}</div></div> : null}
          </section>

          <div className="game-toolbar">
            <button className="icon-action" onClick={() => setShowControls(true)} aria-label="Show controls" title="Flight controls">?</button>
            <button className="icon-action" onClick={() => runtimeRef.current?.setPaused(true)} aria-label="Pause game" title="Pause">II</button>
          </div>
        </>
      ) : null}

      {phase === "paused" ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Game paused">
          <div className="modal">
            <p className="eyebrow">Simulation suspended</p>
            <h2 className="pause-title">Paused</h2>
            <p className="modal-copy">Flight state is frozen. Controller input and procedural audio will resume with the simulation.</p>
            <div className="menu-actions">
              <button className="primary-action" onClick={() => runtimeRef.current?.setPaused(false)}>Resume flight</button>
              <button className="secondary-action" onClick={returnToMenu}>Abort to briefing</button>
            </div>
          </div>
        </div>
      ) : null}

      {showControls ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Flight controls">
          <div className="modal">
            <p className="eyebrow">Unified input map</p>
            <h2>Flight controls</h2>
            <p className="modal-copy">
              Click the flight view to capture the mouse. Xbox, PlayStation and
              other standard-layout controllers are detected automatically with
              deadzone filtering and optional vibration feedback.
            </p>
            <div className="controls-grid">
              {CONTROL_REFERENCE.map(([label, binding]) => (
                <div className="control-row" key={label}><span>{label}</span><kbd>{binding}</kbd></div>
              ))}
            </div>
            <button className="primary-action" onClick={() => setShowControls(false)}>Close reference</button>
          </div>
        </div>
      ) : null}

      {phase === "playing" ? (
        <span className="sr-only" aria-live="polite">
          Input: {telemetry.inputDevice}. Frame rate: {Math.round(telemetry.fps)}.
        </span>
      ) : null}
    </main>
  );
}

function HudMetric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="hud-panel">
      <span className="hud-label">{label}</span>
      <strong className="hud-value">{Math.round(value)} <small>{unit}</small></strong>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  const color = value < 30 ? "var(--red)" : value < 60 ? "var(--amber)" : "var(--lime)";
  return (
    <div className="hud-panel">
      <span className="hud-label">{label}</span>
      <strong className="hud-value">{Math.round(value)} <small>%</small></strong>
      <div className="health-line"><span style={{ width: `${Math.max(0, value)}%`, background: color }} /></div>
    </div>
  );
}
