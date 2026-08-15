export type MissionId = "first-light" | "broken-spear" | "silent-river";
export type CameraMode = "chase" | "cockpit" | "cinematic";
export type WeatherMode = "clear" | "haze" | "storm";
export type MapProvider = "open" | "maptiler" | "mapbox";
export type TerrainSource = MapProvider | "procedural";
export type InputDevice = "keyboard-mouse" | "gamepad";
export type GamePhase = "menu" | "loading" | "playing" | "paused" | "debrief";
export type WeaponType = "cannon" | "hydra" | "hellfire";
export type NetworkStatus = "offline" | "hosting" | "joining" | "connecting" | "connected" | "failed";
export type TargetTrackState = "none" | "acquiring" | "tracking" | "locked" | "masked" | "lost";
export type FlightMode = "ground" | "hover" | "climb" | "descent" | "cruise";
export type MissionPhase = "nav" | "hold" | "engage" | "rtb" | "complete";
export type CombatUiEventKind = "hit" | "critical" | "kill" | "damaged" | "impact";
export type WeaponStatus = "ready" | "cooldown" | "acquiring" | "locked" | "empty";

export interface MissionDefinition {
  id: MissionId;
  index: string;
  callsign: string;
  title: string;
  summary: string;
  location: string;
  risk: "moderate" | "high" | "extreme";
  timeOfDay: number;
  weather: WeatherMode;
  objective: string;
}

export interface AircraftDefinition {
  id: string;
  designation: string;
  name: string;
  manufacturer: string;
  role: string;
  crew: number;
  dimensions: {
    lengthMetres: number;
    heightMetres: number;
    rotorDiameterMetres: number;
  };
  weights: {
    missionGrossKg: number;
    maximumOperatingKg: number;
  };
  performance: {
    maximumSpeedKnots: number;
    combatRangeNm: number;
    enduranceHours: number;
    climbRateMpm: number;
  };
  propulsion: {
    count: number;
    model: string;
    shaftHorsepowerEach: number;
  };
  armament: readonly string[];
  systems: readonly string[];
  sources: readonly { label: string; href: string }[];
  modelCredit: {
    creator: string;
    href: string;
    license: string;
    licenseHref: string;
  };
}

export interface ControlFrame {
  pitch: number;
  roll: number;
  yaw: number;
  collective: number;
  lookX: number;
  lookY: number;
  firePrimary: boolean;
  fireSecondary: boolean;
  device: InputDevice;
}

export interface FlightDataTelemetry {
  mode: FlightMode;
  trueAirspeed: number;
  groundSpeed: number;
  course: number;
  drift: number;
  verticalSpeed: number;
  pitch: number;
  roll: number;
  turnRate: number;
  loadFactor: number;
  torque: number;
  enginePower: number;
  powerMargin: number;
  fuelEnduranceMinutes: number;
  waypointActive: boolean;
  waypointBearing: number;
  waypointRange: number;
  waypointEtaSeconds: number;
}

export interface CombatUiEvent {
  id: number;
  kind: CombatUiEventKind;
  label: string;
  damage?: number;
  direction?: number;
}

export interface EnemyContactTelemetry {
  id: string;
  name: string;
  kind: "helicopter" | "armour" | "sam";
  distance: number;
  bearing: number;
  relativeBearing: number;
  health: number;
  lineOfSight: boolean;
  selected: boolean;
  onScreen: boolean;
  screenX: number;
  screenY: number;
}

export interface FlightTelemetry {
  altitude: number;
  radarAltitude: number;
  airspeed: number;
  verticalSpeed: number;
  heading: number;
  collective: number;
  rotorRpm: number;
  fuel: number;
  hull: number;
  engine: number;
  positionX: number;
  positionZ: number;
  camera: CameraMode;
  inputDevice: InputDevice;
  hoverAssist: boolean;
  fps: number;
  time: string;
  weather: WeatherMode;
  missionTitle: string;
  objective: string;
  objectiveProgress: number;
  objectiveDetail: string;
  missionPhase: MissionPhase;
  cannonAmmo: number;
  rockets: number;
  missiles: number;
  selectedWeapon: WeaponType;
  weaponStatus: WeaponStatus;
  targetName: string;
  targetDistance: number;
  targetKind: "helicopter" | "armour" | "sam" | "none";
  targetState: TargetTrackState;
  targetQuality: number;
  targetHealth: number;
  targetClosure: number;
  targetBearing: number;
  targetRelativeBearing: number;
  targetElevation: number;
  targetLineOfSight: boolean;
  targetAutomatic: boolean;
  targetVisible: boolean;
  targetScreenX: number;
  targetScreenY: number;
  leadVisible: boolean;
  leadScreenX: number;
  leadScreenY: number;
  enemyContacts: EnemyContactTelemetry[];
  flightData: FlightDataTelemetry;
  threatLevel: "clear" | "tracking" | "missile";
  kills: number;
  score: number;
  networkStatus: NetworkStatus;
  terrainSource: TerrainSource;
}

export interface GameSettings {
  flightAssist: boolean;
  mouseSensitivity: number;
  controllerDeadzone: number;
  invertY: boolean;
  masterVolume: number;
  quality: "auto" | "low" | "high";
  realTerrain: boolean;
  mapProvider: MapProvider;
  mapToken: string;
}

export interface RuntimeCallbacks {
  onTelemetry: (telemetry: FlightTelemetry) => void;
  onPause: (paused: boolean) => void;
  onNotice: (message: string) => void;
  onCombatEvent: (event: CombatUiEvent) => void;
  onFatal: (message: string) => void;
  onMissionComplete: (result: MissionResult) => void;
}

export interface MissionResult {
  success: boolean;
  missionId: MissionId;
  score: number;
  kills: number;
  credits: number;
  xp: number;
  flightTime: number;
  rating: "C" | "B" | "A" | "S";
}

export interface CareerProfile {
  version: 1;
  callsign: string;
  level: number;
  xp: number;
  credits: number;
  completedMissions: MissionId[];
  upgrades: {
    engine: number;
    armour: number;
    sensors: number;
    weapons: number;
  };
  statistics: {
    sorties: number;
    victories: number;
    kills: number;
    flightSeconds: number;
    bestScore: number;
  };
}

export interface NetworkFlightState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity: [number, number, number];
  rotorRpm: number;
  hull: number;
  timestamp: number;
}
