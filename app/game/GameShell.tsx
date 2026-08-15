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
  cannonAmmo: 0,
  rockets: 0,
  missiles: 0,
  selectedWeapon: "hydra",
  targetName: "NO TARGET",
  targetDistance: 0,
  threatLevel: "clear",
  kills: 0,
  score: 0,
  networkStatus: "offline",
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

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const networkRef = useRef<NetworkSession | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [mission, setMission] = useState<MissionDefinition>(MISSIONS[0]);
  const [telemetry, setTelemetry] = useState(EMPTY_TELEMETRY);
  const [career, setCareer] = useState<CareerProfile>(DEFAULT_CAREER);
  const [careerReady, setCareerReady] = useState(false);
  const [debrief, setDebrief] = useState<MissionResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState("");
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
      pushNotice(`${mission.callsign} · flight systems online`);
      void canvas.requestPointerLock();
    } catch {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setPhase("menu");
    }
  }, [career, careerReady, mission, networkStatus, pushNotice, settings]);

  const returnToMenu = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setTelemetry(EMPTY_TELEMETRY);
    setDebrief(null);
    setPhase("menu");
    setNotice("");
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
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
                terrain masking and precision weapons across a persistent,
                evolving eight-kilometre battlespace.
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
              <span className={`threat threat-${telemetry.threatLevel}`}>{telemetry.threatLevel}</span>
            </div>

            <div className="hud-left">
              <HudMetric label="Airspeed" value={telemetry.airspeed} unit="KT" />
              <HudMetric label="Altitude MSL" value={telemetry.altitude} unit="FT" />
              <HudMetric label="Radar altitude" value={telemetry.radarAltitude} unit="FT" />
              <HudMetric label="Vertical speed" value={telemetry.verticalSpeed} unit="FPM" />
              <div className="hud-panel compact-panel">
                <span className="hud-label">Target acquisition</span>
                <strong className="hud-target">{telemetry.targetName}</strong>
                <small>{telemetry.targetDistance ? `${Math.round(telemetry.targetDistance)} M` : "TAB / D-PAD UP TO CYCLE"}</small>
              </div>
            </div>

            <div className="hud-right">
              <div className="hud-panel objective-panel">
                <span className="hud-label">Primary objective</span>
                <strong className="objective-name">{telemetry.objective}</strong>
                <small>{telemetry.objectiveDetail}</small>
                <div className="health-line"><span style={{ width: `${telemetry.objectiveProgress * 100}%` }} /></div>
              </div>
              <StatusMetric label="Hull integrity" value={telemetry.hull} />
              <StatusMetric label="Engine" value={telemetry.engine} />
              <StatusMetric label="Fuel" value={telemetry.fuel} />
              <div className="hud-panel compact-panel">
                <span className="hud-label">Rotor / Collective</span>
                <strong className="hud-value">
                  {Math.round(telemetry.rotorRpm)} / {Math.round(telemetry.collective)}<small>%</small>
                </strong>
              </div>
            </div>

            <div className={`reticle ${telemetry.targetName !== "NO TARGET" ? "target-locked" : ""}`} aria-hidden="true">
              <span className="reticle-notch" />
            </div>

            <div className="hud-bottom">
              <div className="weapon-chip">M230 · {telemetry.cannonAmmo}</div>
              <div className="weapon-chip active-weapon">{telemetry.selectedWeapon} · {secondaryAmmo}</div>
              <div className="weapon-chip airframe-chip">{ACTIVE_AIRCRAFT.designation} · GUARDIAN</div>
              <div className="weapon-chip">K {telemetry.kills} · {telemetry.score.toLocaleString()} PTS</div>
              {telemetry.networkStatus === "connected" ? <div className="weapon-chip network-live">WINGMAN · LIVE</div> : null}
              <div className={`assist-chip ${telemetry.hoverAssist ? "active" : ""}`}>
                Hover assist {telemetry.hoverAssist ? "ON" : "OFF"}
              </div>
            </div>

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
            <p className="modal-copy">Flight state, AI and weapons are frozen. Your controller and procedural audio resume with the simulation.</p>
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
            deadzone filtering and supported haptic feedback.
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
              <span>
                3D model by <a href={ACTIVE_AIRCRAFT.modelCredit.href} target="_blank" rel="noreferrer">{ACTIVE_AIRCRAFT.modelCredit.creator}</a>
                {" · "}<a href={ACTIVE_AIRCRAFT.modelCredit.licenseHref} target="_blank" rel="noreferrer">{ACTIVE_AIRCRAFT.modelCredit.license}</a>
                {" · Optimized and adapted for RotorFrontier"}
              </span>
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
            <ToggleSetting label="Flight stability assist" checked={settings.flightAssist} onChange={(value) => updateSetting("flightAssist", value)} />
            <ToggleSetting label="Invert cyclic Y axis" checked={settings.invertY} onChange={(value) => updateSetting("invertY", value)} />
            <label className="setting-row">
              <span><strong>Rendering quality</strong><small>Auto adapts to CPU cores and device memory.</small></span>
              <select value={settings.quality} onChange={(event) => updateSetting("quality", event.target.value as GameSettings["quality"])}>
                <option value="auto">Auto</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <p className="modal-copy">Changes are saved locally and apply on the next sortie.</p>
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

function HudMetric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="hud-panel">
      <span className="hud-label">{label}</span>
      <strong className="hud-value">{Math.round(value)} <small>{unit}</small></strong>
    </div>
  );
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
