"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMissionResult,
  DEFAULT_CAREER,
  loadCareer,
  purchaseUpgrade,
  saveCareer,
  upgradeCost,
} from "./CareerStore";
import { ACTIVE_AIRCRAFT, CONTROL_REFERENCE, DEFAULT_SETTINGS, MISSIONS } from "./config";
import HangarViewer from "./HangarViewer";
import type { GameRuntime } from "./GameRuntime";
import { NetworkSession } from "./NetworkSession";
import type {
  CareerProfile,
  CombatUiEvent,
  FlightTelemetry,
  GamePhase,
  GameSettings,
  MissionDefinition,
  MissionResult,
  NetworkStatus,
} from "./types";

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
  objectiveDetail: "",
  missionPhase: "nav",
  cannonAmmo: 0,
  rockets: 0,
  missiles: 0,
  selectedWeapon: "hydra",
  targetName: "NO TARGET",
  targetDistance: 0,
  targetKind: "none",
  targetState: "none",
  targetQuality: 0,
  targetHealth: 0,
  targetClosure: 0,
  targetBearing: 0,
  targetRelativeBearing: 0,
  targetElevation: 0,
  targetLineOfSight: false,
  targetVisible: false,
  targetScreenX: 50,
  targetScreenY: 50,
  leadVisible: false,
  leadScreenX: 50,
  leadScreenY: 50,
  flightData: {
    mode: "ground",
    trueAirspeed: 0,
    groundSpeed: 0,
    course: 0,
    drift: 0,
    verticalSpeed: 0,
    pitch: 0,
    roll: 0,
    turnRate: 0,
    loadFactor: 1,
    torque: 0,
    enginePower: 0,
    powerMargin: 0,
    fuelEnduranceMinutes: 0,
    waypointActive: false,
    waypointBearing: 0,
    waypointRange: 0,
    waypointEtaSeconds: 0,
  },
  threatLevel: "clear",
  kills: 0,
  score: 0,
  networkStatus: "offline",
  terrainSource: "procedural",
};

type UpgradeSystem = keyof CareerProfile["upgrades"];
type Panel = "controls" | "hangar" | "settings" | "coop" | null;

const UPGRADE_DATA: Array<{
  system: UpgradeSystem;
  name: string;
  code: string;
  description: string;
}> = [
  { system: "engine", name: "Turboshaft", code: "T700-GE", description: "+3.5% lift authority per tier" },
  { system: "armour", name: "Survivability", code: "AN/AVR", description: "+12 hull and damage mitigation" },
  { system: "sensors", name: "Targeting suite", code: "TADS/PNVS", description: "Long-range target acquisition" },
  { system: "weapons", name: "Stores system", code: "M299", description: "More ammunition per sortie" },
];

function MapAttribution({ source }: { source: FlightTelemetry["terrainSource"] }) {
  if (source === "procedural") return null;
  if (source === "maptiler") {
    return (
      <div className="map-attribution">
        Map © <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a>
        {" · Data © "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
      </div>
    );
  }
  if (source === "mapbox") {
    return (
      <div className="map-attribution">
        Map © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a>
        {" · Data © "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
      </div>
    );
  }
  return (
    <div className="map-attribution">
      Terrain © <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">AWS Open Data / Mapzen</a>
      {" · Map © "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
    </div>
  );
}

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const networkRef = useRef<NetworkSession | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [mission, setMission] = useState<MissionDefinition>(MISSIONS[0]);
  const [telemetry, setTelemetry] = useState(EMPTY_TELEMETRY);
  const [career, setCareer] = useState<CareerProfile>(DEFAULT_CAREER);
  const [careerReady, setCareerReady] = useState(false);
  const [debrief, setDebrief] = useState<MissionResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState("");
  const [combatEvent, setCombatEvent] = useState<CombatUiEvent | null>(null);
  const [fatalError, setFatalError] = useState("");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("offline");
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [incomingCode, setIncomingCode] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => {
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

  const pushCombatEvent = useCallback((event: CombatUiEvent) => {
    setCombatEvent(event);
    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    const duration = event.kind === "damaged" || event.kind === "impact" ? 900 : event.kind === "kill" ? 760 : 480;
    combatTimerRef.current = setTimeout(() => setCombatEvent(null), duration);
  }, []);

  useEffect(() => {
    let active = true;
    void loadCareer().then((stored) => {
      if (!active) return;
      setCareer(stored);
      setCareerReady(true);
    });
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("rotorfrontier.settings", JSON.stringify(settings));
  }, [settings]);

  const ensureNetwork = useCallback(() => {
    if (!networkRef.current) networkRef.current = new NetworkSession();
    networkRef.current.onStatus = setNetworkStatus;
    return networkRef.current;
  }, []);

  const launch = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || runtimeRef.current || !careerReady) return;
    setFatalError("");
    setDebrief(null);
    setPhase("loading");
    try {
      const { GameRuntime: Runtime } = await import("./GameRuntime");
      const runtime = new Runtime(
        canvas,
        mission,
        settings,
        career,
        {
          onTelemetry: setTelemetry,
          onPause: (paused) => setPhase(paused ? "paused" : "playing"),
          onNotice: pushNotice,
          onCombatEvent: pushCombatEvent,
          onFatal: setFatalError,
          onMissionComplete: (result) => {
            const updated = applyMissionResult(career, result);
            setCareer(updated);
            void saveCareer(updated);
            setDebrief(result);
            setPhase("debrief");
            if (document.pointerLockElement) document.exitPointerLock();
          },
        },
        networkStatus === "connected" ? networkRef.current ?? undefined : undefined,
      );
      runtimeRef.current = runtime;
      await runtime.initialize();
      setPhase("playing");
      pushNotice("On skids · Space / RT ascend · WASD / left stick move");
      void canvas.requestPointerLock();
    } catch {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setPhase("menu");
    }
  }, [career, careerReady, mission, networkStatus, pushCombatEvent, pushNotice, settings]);

  const returnToMenu = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setTelemetry(EMPTY_TELEMETRY);
    setDebrief(null);
    setPhase("menu");
    setNotice("");
    setCombatEvent(null);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    if (combatTimerRef.current) clearTimeout(combatTimerRef.current);
    runtimeRef.current?.dispose();
    if (networkRef.current) {
      networkRef.current.onStatus = () => undefined;
      networkRef.current.dispose();
    }
  }, []);

  const updateSetting = <Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const buyUpgrade = (system: UpgradeSystem) => {
    const updated = purchaseUpgrade(career, system);
    if (!updated) {
      pushNotice(career.upgrades[system] >= 5 ? "System already at maximum tier" : "Insufficient credits");
      return;
    }
    setCareer(updated);
    void saveCareer(updated);
    pushNotice(`${system.toUpperCase()} upgraded to tier ${updated.upgrades[system]}`);
  };

  const hostSession = async () => {
    setNetworkBusy(true);
    setNetworkError("");
    setAnswerCode("");
    try {
      setOfferCode(await ensureNetwork().createOffer());
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "Unable to create the co-op invite.");
    } finally {
      setNetworkBusy(false);
    }
  };

  const joinSession = async () => {
    if (!incomingCode.trim()) return;
    setNetworkBusy(true);
    setNetworkError("");
    setOfferCode("");
    try {
      setAnswerCode(await ensureNetwork().acceptOffer(incomingCode));
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "The host invite is invalid.");
    } finally {
      setNetworkBusy(false);
    }
  };

  const applyAnswer = async () => {
    if (!incomingCode.trim()) return;
    setNetworkBusy(true);
    setNetworkError("");
    try {
      await ensureNetwork().acceptAnswer(incomingCode);
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : "The wingman answer is invalid.");
    } finally {
      setNetworkBusy(false);
    }
  };

  const disconnect = () => {
    networkRef.current?.dispose();
    setOfferCode("");
    setAnswerCode("");
    setIncomingCode("");
    setNetworkError("");
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      pushNotice("Secure connection code copied");
    } catch {
      pushNotice("Select and copy the code manually");
    }
  };

  const compass = useMemo(() => Math.round(telemetry.heading).toString().padStart(3, "0"), [telemetry.heading]);
  const secondaryAmmo = telemetry.selectedWeapon === "hellfire" ? telemetry.missiles : telemetry.rockets;
  const mapProviderLabel = !settings.realTerrain
    ? "procedural"
    : settings.mapProvider === "open"
      ? "open data"
      : settings.mapProvider;
  const showHitCue = combatEvent?.kind === "hit" || combatEvent?.kind === "critical" || combatEvent?.kind === "kill";
  const showDamageCue = combatEvent?.kind === "damaged" || combatEvent?.kind === "impact";
  const targetBearing = Math.round(telemetry.targetBearing).toString().padStart(3, "0");
  const waypointBearing = Math.round(telemetry.flightData.waypointBearing).toString().padStart(3, "0");

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
                  <div className="brand-build">Combat flight systems · Production alpha</div>
                </div>
              </div>

              <p className="eyebrow">Tactical helicopter operations</p>
              <h1 className="menu-title">Own the <span>vertical</span></h1>
              <p className="menu-copy">
                A physics-driven combat flight experience. Master rotor energy,
                terrain masking and precision weapons across a streamed,
                real-elevation Nairobi battlespace.
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
              <p className="mission-brief">{mission.summary}</p>

              <div className="menu-actions">
                <button className="primary-action" onClick={() => void launch()} disabled={phase === "loading" || !careerReady}>
                  {phase === "loading" ? "Initializing…" : careerReady ? "Launch operation" : "Loading career…"}
                </button>
                <button className="secondary-action" onClick={() => setPanel("coop")}>Online co-op</button>
                <button className="secondary-action" onClick={() => setPanel("hangar")}>Hangar</button>
                <button className="secondary-action" onClick={() => setPanel("controls")}>Controls</button>
                <button className="secondary-action" onClick={() => setPanel("settings")}>Settings</button>
              </div>
              {fatalError ? <div className="error-box">{fatalError}</div> : null}
              {notice ? <div className="menu-notice" aria-live="polite">{notice}</div> : null}
            </div>

            <aside className="system-strip" aria-label="System readiness">
              <div className="pilot-card">
                <span>Active pilot</span>
                <strong>{career.callsign}</strong>
                <output>LVL {career.level}</output>
              </div>
              <div className="system-row"><span>Career credits</span><output>{career.credits.toLocaleString()} CR</output></div>
              <div className="system-row"><span>Airframe</span><output>{ACTIVE_AIRCRAFT.designation} Guardian</output></div>
              <div className="system-row"><span>Powerplant</span><output>2× {ACTIVE_AIRCRAFT.propulsion.model}</output></div>
              <div className="system-row"><span>Network</span><output className={`network-${networkStatus}`}>{networkStatus}</output></div>
              <div className="system-row"><span>Renderer</span><output>WebGPU / WebGL 2</output></div>
              <div className="system-row"><span>Input bus</span><output>Mouse · Keys · Gamepad</output></div>
              <div className="system-row"><span>Flight model</span><output>60 Hz fixed-step</output></div>
              <div className="system-row"><span>World</span><output>Nairobi · 8.2 km</output></div>
              <div className="system-row"><span>Map source</span><output>{mapProviderLabel}</output></div>
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
              <span className="flight-mode-chip">{telemetry.flightData.mode}</span>
              <span>{telemetry.time} local</span>
              <span>{telemetry.weather}</span>
              <span className={`threat threat-${telemetry.threatLevel}`}>{telemetry.threatLevel}</span>
            </div>

            <div className="hud-left">
              <div className="hud-panel fdc-panel">
                <div className="module-heading">
                  <span className="hud-label">Flight data computer</span>
                  <strong>{telemetry.flightData.mode}</strong>
                </div>
                <div className="fdc-grid">
                  <DataCell label="TAS" value={Math.round(telemetry.flightData.trueAirspeed)} unit="KT" />
                  <DataCell label="GS" value={Math.round(telemetry.flightData.groundSpeed)} unit="KT" />
                  <DataCell label="BARO" value={Math.round(telemetry.altitude)} unit="FT" />
                  <DataCell label="RALT" value={Math.round(telemetry.radarAltitude)} unit="FT" />
                  <DataCell label="VSI" value={Math.round(telemetry.flightData.verticalSpeed)} unit="FPM" />
                  <DataCell label="LOAD" value={telemetry.flightData.loadFactor.toFixed(1)} unit="G" />
                </div>
                <div className="attitude-strip">
                  <span>P {formatSigned(telemetry.flightData.pitch)}°</span>
                  <div className="attitude-mini" aria-label={`Pitch ${Math.round(telemetry.flightData.pitch)} degrees, roll ${Math.round(telemetry.flightData.roll)} degrees`}>
                    <i style={{ transform: `translateY(${Math.max(-12, Math.min(12, telemetry.flightData.pitch * 0.35))}px) rotate(${-telemetry.flightData.roll}deg)` }} />
                  </div>
                  <span>R {formatSigned(telemetry.flightData.roll)}°</span>
                </div>
              </div>

              <div className="hud-panel nav-panel">
                <div className="module-heading">
                  <span className="hud-label">Navigation solution</span>
                  <strong>{telemetry.flightData.waypointActive ? "ACTIVE" : "STANDBY"}</strong>
                </div>
                <div className="nav-row">
                  <span>TRK <strong>{Math.round(telemetry.flightData.course).toString().padStart(3, "0")}°</strong></span>
                  <span>DRIFT <strong>{formatSigned(telemetry.flightData.drift)}°</strong></span>
                </div>
                {telemetry.flightData.waypointActive ? (
                  <div className="waypoint-solution">
                    <span>BRG <strong>{waypointBearing}°</strong></span>
                    <span>RNG <strong>{formatRange(telemetry.flightData.waypointRange)}</strong></span>
                    <span>ETE <strong>{formatEta(telemetry.flightData.waypointEtaSeconds)}</strong></span>
                  </div>
                ) : <small>NO ACTIVE STEERPOINT</small>}
              </div>

              <div className={`hud-panel target-panel track-${telemetry.targetState}`}>
                <div className="module-heading">
                  <span className="hud-label">TADS target track</span>
                  <strong>{telemetry.targetState}</strong>
                </div>
                <strong className="hud-target">{telemetry.targetName}</strong>
                {telemetry.targetName !== "NO TARGET" ? (
                  <>
                    <div className="target-data-grid">
                      <span>RNG <strong>{formatRange(telemetry.targetDistance)}</strong></span>
                      <span>BRG <strong>{targetBearing}°</strong></span>
                      <span>CLS <strong>{formatSigned(telemetry.targetClosure)} M/S</strong></span>
                      <span>EL <strong>{formatSigned(telemetry.targetElevation)}°</strong></span>
                    </div>
                    <div className="target-health-row"><span>TRACK {Math.round(telemetry.targetQuality)}%</span><span>HP {Math.round(telemetry.targetHealth)}%</span></div>
                    <div className="dual-track"><i style={{ width: `${telemetry.targetQuality}%` }} /><b style={{ width: `${telemetry.targetHealth}%` }} /></div>
                    <small>{telemetry.targetLineOfSight ? "LOS VALID" : "TERRAIN MASKED"} · AZ {formatSigned(telemetry.targetRelativeBearing)}°</small>
                  </>
                ) : <small>TAB / D-PAD UP TO ACQUIRE</small>}
              </div>
            </div>

            <div className="hud-right">
              <div className="hud-panel objective-panel">
                <div className="module-heading"><span className="hud-label">Primary objective</span><strong>{telemetry.missionPhase}</strong></div>
                <strong className="objective-name">{telemetry.objective}</strong>
                <small>{telemetry.objectiveDetail}</small>
                <div className="health-line"><span style={{ width: `${telemetry.objectiveProgress * 100}%` }} /></div>
              </div>
              <div className="hud-panel power-panel">
                <div className="module-heading"><span className="hud-label">Powertrain</span><strong>{telemetry.flightData.powerMargin < 12 ? "LIMIT" : "NOMINAL"}</strong></div>
                <div className="power-grid">
                  <DataCell label="NR" value={Math.round(telemetry.rotorRpm)} unit="%" />
                  <DataCell label="TQ" value={Math.round(telemetry.flightData.torque)} unit="%" />
                  <DataCell label="ENG" value={Math.round(telemetry.flightData.enginePower)} unit="%" />
                  <DataCell label="MARGIN" value={Math.round(telemetry.flightData.powerMargin)} unit="%" />
                </div>
                <small>COLL {Math.round(telemetry.collective)}% · END {formatEndurance(telemetry.flightData.fuelEnduranceMinutes)}</small>
              </div>
              <StatusMetric label="Hull integrity" value={telemetry.hull} />
              <StatusMetric label="Engine" value={telemetry.engine} />
              <StatusMetric label="Fuel" value={telemetry.fuel} />
            </div>

            {telemetry.targetVisible ? (
              <div
                className={`target-bracket track-${telemetry.targetState}`}
                style={{ left: `${telemetry.targetScreenX}%`, top: `${telemetry.targetScreenY}%` }}
                aria-hidden="true"
              >
                <span className="bracket-name">{telemetry.targetName}</span>
                <span className="bracket-data">{Math.round(telemetry.targetDistance)} M · {Math.round(telemetry.targetQuality)}%</span>
              </div>
            ) : null}

            {telemetry.leadVisible ? (
              <div className="lead-cue" style={{ left: `${telemetry.leadScreenX}%`, top: `${telemetry.leadScreenY}%` }} aria-hidden="true"><span /></div>
            ) : null}

            <div className={`reticle track-${telemetry.targetState}`} aria-hidden="true">
              <span className="reticle-notch" />
            </div>

            {showHitCue && combatEvent ? (
              <div key={combatEvent.id} className={`hit-confirm hit-${combatEvent.kind}`} aria-live="assertive">
                <i /><b />
                <strong>{combatEvent.label}</strong>
                {combatEvent.damage ? <span>+{Math.round(combatEvent.damage)} DMG</span> : null}
              </div>
            ) : null}

            {showDamageCue && combatEvent ? (
              <div key={combatEvent.id} className={`combat-impact impact-${combatEvent.kind}`} aria-live="assertive">
                <div className="damage-vignette" />
                {combatEvent.kind === "damaged" && combatEvent.direction !== undefined ? (
                  <div className="damage-direction" style={{ transform: `translateX(-50%) rotate(${combatEvent.direction}deg)` }}><i /></div>
                ) : null}
                <strong>{combatEvent.label}</strong>
              </div>
            ) : null}

            {telemetry.flightData.mode === "ground" && telemetry.hoverAssist ? (
              <div className="takeoff-hint" aria-live="polite">
                <strong>Ready for takeoff</strong>
                <span>SPACE / RT ASCEND · WASD / LEFT STICK MOVE · Q/E / BUMPERS TURN</span>
              </div>
            ) : null}

            <div className="hud-bottom">
              <div className="weapon-chip">M230 · {telemetry.cannonAmmo}</div>
              <div className="weapon-chip active-weapon">{telemetry.selectedWeapon} · {secondaryAmmo}</div>
              <div className="weapon-chip airframe-chip">{ACTIVE_AIRCRAFT.designation} · GUARDIAN</div>
              <div className="weapon-chip">K {telemetry.kills} · {telemetry.score.toLocaleString()} PTS</div>
              {telemetry.networkStatus === "connected" ? <div className="weapon-chip network-live">WINGMAN · LIVE</div> : null}
              <div className={`assist-chip ${telemetry.hoverAssist ? "active" : ""}`}>
                Arcade assist {telemetry.hoverAssist ? "ON" : "OFF"}
              </div>
            </div>

            <MapAttribution source={telemetry.terrainSource} />

            {notice ? <div className="toast-stack" aria-live="polite"><div className="toast">{notice}</div></div> : null}
          </section>

          <div className="game-toolbar">
            <button className="icon-action" onClick={() => { runtimeRef.current?.setPaused(true); setPanel("controls"); }} aria-label="Show controls" title="Flight controls">?</button>
            <button className="icon-action" onClick={() => runtimeRef.current?.setPaused(true)} aria-label="Pause game" title="Pause">II</button>
          </div>
        </>
      ) : null}

      {phase === "paused" ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Game paused">
          <div className="modal">
            <p className="eyebrow">Simulation suspended</p>
            <h2 className="pause-title">Paused</h2>
            <p className="modal-copy">Flight state, AI, weapons and the sampled rotor audio are frozen. All systems resume with the simulation.</p>
            <div className="menu-actions">
              <button className="primary-action" onClick={() => runtimeRef.current?.setPaused(false)}>Resume flight</button>
              <button className="secondary-action" onClick={returnToMenu}>Abort to briefing</button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "debrief" && debrief ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Mission debrief">
          <div className="modal debrief-modal">
            <p className="eyebrow">After-action report</p>
            <div className={`rating rating-${debrief.rating}`}>{debrief.rating}</div>
            <h2>{debrief.success ? "Operation complete" : "Aircraft lost"}</h2>
            <p className="modal-copy">{mission.callsign} · {mission.location}</p>
            <div className="debrief-grid">
              <DebriefMetric label="Mission score" value={debrief.score.toLocaleString()} />
              <DebriefMetric label="Confirmed kills" value={debrief.kills.toString()} />
              <DebriefMetric label="Credits earned" value={`+${debrief.credits.toLocaleString()}`} />
              <DebriefMetric label="Pilot XP" value={`+${debrief.xp.toLocaleString()}`} />
              <DebriefMetric label="Flight time" value={formatDuration(debrief.flightTime)} />
              <DebriefMetric label="Career level" value={career.level.toString()} />
            </div>
            <button className="primary-action" onClick={returnToMenu}>Return to operations</button>
          </div>
        </div>
      ) : null}

      {panel === "controls" ? (
        <Modal eyebrow="Unified input map" title="Flight controls" onClose={() => setPanel(null)}>
          <p className="modal-copy">
            Click the flight view to capture the mouse. Xbox, PlayStation and
            standard-layout controllers are detected automatically, with radial
            deadzone filtering and supported haptic feedback. In the default arcade
            assist mode, hold Space or RT to ascend and C or LT to descend; releasing
            either captures a hover. WASD, arrow keys or the left stick command direct
            movement, with automatic levelling and braking. Press H or the left-stick
            button to toggle the advanced persistent-collective flight model.
          </p>
          <div className="controls-grid">
            {CONTROL_REFERENCE.map(([label, binding]) => (
              <div className="control-row" key={label}><span>{label}</span><kbd>{binding}</kbd></div>
            ))}
          </div>
        </Modal>
      ) : null}

      {panel === "hangar" ? (
        <Modal eyebrow="Airframe dossier · Persistent career" title="AH-64E Guardian Hangar" onClose={() => setPanel(null)} wide>
          <section className="aircraft-dossier" aria-label={`${ACTIVE_AIRCRAFT.designation} ${ACTIVE_AIRCRAFT.name} specifications`}>
            <header className="aircraft-dossier-header">
              <div className="aircraft-roundel" aria-hidden="true"><span>64E</span></div>
              <div>
                <span className="aircraft-kicker">{ACTIVE_AIRCRAFT.manufacturer} · {ACTIVE_AIRCRAFT.role}</span>
                <h3><strong>{ACTIVE_AIRCRAFT.designation}</strong> {ACTIVE_AIRCRAFT.name}</h3>
                <p>Tandem-seat, all-weather precision attack platform with a fully modelled sensor nose, cockpit, landing gear, weapons pylons and rotor system.</p>
              </div>
              <span className="aircraft-readiness"><i /> Combat ready</span>
            </header>

            <HangarViewer />

            <div className="aircraft-dossier-grid">
              <div className="aircraft-spec-grid">
                <DossierMetric label="Crew" value={ACTIVE_AIRCRAFT.crew.toString()} detail="Pilot + CPG" />
                <DossierMetric label="Maximum speed" value={`${ACTIVE_AIRCRAFT.performance.maximumSpeedKnots} kt`} detail="Combat mission" />
                <DossierMetric label="Combat range" value={`${ACTIVE_AIRCRAFT.performance.combatRangeNm} nm`} detail="Army reference" />
                <DossierMetric label="Endurance" value={`${ACTIVE_AIRCRAFT.performance.enduranceHours} hr`} detail="Combat profile" />
                <DossierMetric label="Length / height" value={`${ACTIVE_AIRCRAFT.dimensions.lengthMetres} / ${ACTIVE_AIRCRAFT.dimensions.heightMetres} m`} detail="48.2 / 15.4 ft" />
                <DossierMetric label="Rotor diameter" value={`${ACTIVE_AIRCRAFT.dimensions.rotorDiameterMetres} m`} detail="Four-blade system" />
                <DossierMetric label="Mission gross" value={`${ACTIVE_AIRCRAFT.weights.missionGrossKg.toLocaleString()} kg`} detail="15,075 lb" />
                <DossierMetric label="Maximum operating" value={`${ACTIVE_AIRCRAFT.weights.maximumOperatingKg.toLocaleString()} kg`} detail="23,000 lb" />
              </div>

              <div className="aircraft-systems">
                <section>
                  <span>Propulsion</span>
                  <strong>{ACTIVE_AIRCRAFT.propulsion.count} × {ACTIVE_AIRCRAFT.propulsion.model}</strong>
                  <small>{ACTIVE_AIRCRAFT.propulsion.shaftHorsepowerEach.toLocaleString()} shp each · {ACTIVE_AIRCRAFT.performance.climbRateMpm}+ m/min climb</small>
                </section>
                <section>
                  <span>Standard combat load</span>
                  <ul>{ACTIVE_AIRCRAFT.armament.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section>
                  <span>Mission systems</span>
                  <ul>{ACTIVE_AIRCRAFT.systems.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              </div>
            </div>

            <footer className="aircraft-sources">
              <div className="aircraft-credit-stack">
                <span>
                  3D model by <a href={ACTIVE_AIRCRAFT.modelCredit.href} target="_blank" rel="noreferrer">{ACTIVE_AIRCRAFT.modelCredit.creator}</a>
                  {" · "}<a href={ACTIVE_AIRCRAFT.modelCredit.licenseHref} target="_blank" rel="noreferrer">{ACTIVE_AIRCRAFT.modelCredit.license}</a>
                  {" · Optimized and adapted for RotorFrontier"}
                </span>
                <span>
                  Audio: <a href="https://freesound.org/people/qubodup/sounds/187681/" target="_blank" rel="noreferrer">rotor · qubodup · CC0</a>
                  {" · "}<a href="https://opengameart.org/content/collection-gun-sounds" target="_blank" rel="noreferrer">cannon · AVW · CC BY 3.0</a>
                  {" · "}<a href="https://opengameart.org/content/rocket-launch" target="_blank" rel="noreferrer">rocket · qubodup · CC0</a>
                </span>
              </div>
              <nav aria-label="Aircraft specification sources">
                {ACTIVE_AIRCRAFT.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.label}</a>)}
              </nav>
            </footer>
          </section>

          <div className="career-banner">
            <div><span>Pilot</span><strong>{career.callsign}</strong></div>
            <div><span>Level</span><strong>{career.level}</strong></div>
            <div><span>Available</span><strong>{career.credits.toLocaleString()} CR</strong></div>
            <div><span>Victories</span><strong>{career.statistics.victories}</strong></div>
          </div>
          <div className="upgrade-grid">
            {UPGRADE_DATA.map((item) => {
              const level = career.upgrades[item.system];
              const cost = upgradeCost(level);
              return (
                <article className="upgrade-card" key={item.system}>
                  <div className="upgrade-heading"><span>{item.code}</span><strong>TIER {level}/5</strong></div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="tier-track" aria-label={`${item.name} tier ${level} of 5`}>
                    {[1, 2, 3, 4, 5].map((tier) => <span className={tier <= level ? "filled" : ""} key={tier} />)}
                  </div>
                  <button
                    className="secondary-action upgrade-action"
                    onClick={() => buyUpgrade(item.system)}
                    disabled={level >= 5 || career.credits < cost}
                  >
                    {level >= 5 ? "Maximum tier" : `Upgrade · ${cost.toLocaleString()} CR`}
                  </button>
                </article>
              );
            })}
          </div>
          {notice ? <p className="modal-feedback" aria-live="polite">{notice}</p> : null}
        </Modal>
      ) : null}

      {panel === "settings" ? (
        <Modal eyebrow="Simulation profile" title="Settings" onClose={() => setPanel(null)}>
          <div className="settings-list">
            <RangeSetting label="Mouse sensitivity" value={settings.mouseSensitivity} min={0.2} max={1.5} step={0.01} onChange={(value) => updateSetting("mouseSensitivity", value)} />
            <RangeSetting label="Controller deadzone" value={settings.controllerDeadzone} min={0.04} max={0.3} step={0.01} onChange={(value) => updateSetting("controllerDeadzone", value)} />
            <RangeSetting label="Master volume" value={settings.masterVolume} min={0} max={1} step={0.01} onChange={(value) => updateSetting("masterVolume", value)} />
            <ToggleSetting label="Arcade flight assist" checked={settings.flightAssist} onChange={(value) => updateSetting("flightAssist", value)} />
            <ToggleSetting label="Invert cyclic Y axis" checked={settings.invertY} onChange={(value) => updateSetting("invertY", value)} />
            <ToggleSetting label="Stream real Nairobi terrain" checked={settings.realTerrain} onChange={(value) => updateSetting("realTerrain", value)} />
            <label className="setting-row">
              <span><strong>Map provider</strong><small>Open data works immediately; MapTiler and Mapbox add satellite imagery.</small></span>
              <select
                value={settings.mapProvider}
                onChange={(event) => updateSetting("mapProvider", event.target.value as GameSettings["mapProvider"])}
                disabled={!settings.realTerrain}
              >
                <option value="open">Open data · no token</option>
                <option value="maptiler">MapTiler</option>
                <option value="mapbox">Mapbox</option>
              </select>
            </label>
            {settings.realTerrain && settings.mapProvider !== "open" ? (
              <label className="setting-row map-token-row">
                <span><strong>Public map token</strong><small>Stored only in this browser and never committed to the game source.</small></span>
                <input
                  type="password"
                  value={settings.mapToken}
                  onChange={(event) => updateSetting("mapToken", event.target.value)}
                  placeholder={settings.mapProvider === "maptiler" ? "MapTiler API key" : "Mapbox public token"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ) : null}
            <label className="setting-row">
              <span><strong>Rendering quality</strong><small>Auto adapts to CPU cores and device memory.</small></span>
              <select value={settings.quality} onChange={(event) => updateSetting("quality", event.target.value as GameSettings["quality"])}>
                <option value="auto">Auto</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <p className="modal-copy">
            Nairobi is centred at 1.2864° S, 36.8172° E. Changes are saved locally and apply on the next sortie.
          </p>
        </Modal>
      ) : null}

      {panel === "coop" ? (
        <Modal eyebrow="Two-ship operations" title="Online co-op" onClose={() => setPanel(null)} wide>
          <div className="network-summary">
            <span className={`status-dot status-${networkStatus}`} />
            <div><strong>{networkStatus}</strong><small>Encrypted browser-to-browser WebRTC session</small></div>
            {networkStatus !== "offline" ? <button className="text-action" onClick={disconnect}>Disconnect</button> : null}
          </div>
          {networkStatus === "connected" ? (
            <div className="connected-banner">
              <strong>Wingman data link established</strong>
              <span>Launch the same operation to fly as a synchronized two-aircraft element.</span>
            </div>
          ) : (
            <div className="coop-grid">
              <section className="coop-card">
                <span className="step-number">01</span>
                <h3>Host a flight</h3>
                <p>Create an invite, send it to your wingman, then paste their answer below.</p>
                <button className="secondary-action" onClick={() => void hostSession()} disabled={networkBusy}>Create host invite</button>
                {offerCode ? <SignalBox label="Host invite" value={offerCode} onCopy={() => void copyCode(offerCode)} /> : null}
                {offerCode ? (
                  <>
                    <label className="signal-label">Wingman answer</label>
                    <textarea value={incomingCode} onChange={(event) => setIncomingCode(event.target.value)} placeholder="Paste the wingman answer code" />
                    <button className="primary-action compact-action" onClick={() => void applyAnswer()} disabled={networkBusy || !incomingCode.trim()}>Connect wingman</button>
                  </>
                ) : null}
              </section>
              <section className="coop-card">
                <span className="step-number">02</span>
                <h3>Join a flight</h3>
                <p>Paste the host invite. Return the generated answer to the host to complete the link.</p>
                <label className="signal-label">Host invite</label>
                <textarea value={offerCode ? "" : incomingCode} onChange={(event) => setIncomingCode(event.target.value)} placeholder="Paste the host invite code" disabled={Boolean(offerCode)} />
                <button className="secondary-action" onClick={() => void joinSession()} disabled={networkBusy || Boolean(offerCode) || !incomingCode.trim()}>Generate answer</button>
                {answerCode ? <SignalBox label="Wingman answer" value={answerCode} onCopy={() => void copyCode(answerCode)} /> : null}
              </section>
            </div>
          )}
          {networkBusy ? <p className="modal-feedback">Gathering secure network candidates…</p> : null}
          {networkError ? <div className="error-box">{networkError}</div> : null}
          <p className="network-note">Peer-to-peer connections use invite codes and public STUN discovery. Restrictive enterprise or carrier NAT networks may require a future TURN relay.</p>
        </Modal>
      ) : null}

      {phase === "playing" ? (
        <span className="sr-only" aria-live="polite">
          Input: {telemetry.inputDevice}. Frame rate: {Math.round(telemetry.fps)}.
        </span>
      ) : null}
    </main>
  );
}

function Modal({
  eyebrow,
  title,
  onClose,
  wide = false,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? "modal-wide" : ""}`}>
        <button className="modal-close" onClick={onClose} aria-label={`Close ${title}`}>×</button>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function SignalBox({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="signal-box">
      <span>{label}</span>
      <code>{value}</code>
      <button className="text-action" onClick={onCopy}>Copy code</button>
    </div>
  );
}

function RangeSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{Math.round(value * 100)}%</small></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{checked ? "Enabled" : "Disabled"}</small></span>
      <input className="toggle" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function DataCell({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return (
    <div className="data-cell">
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
    </div>
  );
}

function formatSigned(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatRange(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} KM` : `${Math.round(metres)} M`;
}

function formatEta(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const bounded = Math.min(seconds, 5_999);
  return `${Math.floor(bounded / 60).toString().padStart(2, "0")}:${Math.floor(bounded % 60).toString().padStart(2, "0")}`;
}

function formatEndurance(minutes: number) {
  if (!Number.isFinite(minutes)) return "--";
  const hours = Math.floor(minutes / 60);
  return `${hours}:${Math.floor(minutes % 60).toString().padStart(2, "0")}`;
}

function DossierMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="dossier-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
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

function DebriefMetric({ label, value }: { label: string; value: string }) {
  return <div className="debrief-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
