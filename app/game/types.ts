export type MissionId = "first-light" | "broken-spear" | "silent-river";
export type CameraMode = "chase" | "cockpit" | "cinematic";
export type WeatherMode = "clear" | "haze" | "storm";
export type InputDevice = "keyboard-mouse" | "gamepad";
export type GamePhase = "menu" | "loading" | "playing" | "paused" | "debrief";
export type WeaponType = "cannon" | "hydra" | "hellfire";
export type NetworkStatus = "offline" | "hosting" | "joining" | "connecting" | "connected" | "failed";

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
  cannonAmmo: number;
  rockets: number;
  missiles: number;
  selectedWeapon: WeaponType;
  targetName: string;
  targetDistance: number;
  threatLevel: "clear" | "tracking" | "missile";
  kills: number;
  score: number;
  networkStatus: NetworkStatus;
}

export interface GameSettings {
  flightAssist: boolean;
  mouseSensitivity: number;
  controllerDeadzone: number;
  invertY: boolean;
  masterVolume: number;
  quality: "auto" | "low" | "high";
}

export interface RuntimeCallbacks {
  onTelemetry: (telemetry: FlightTelemetry) => void;
  onPause: (paused: boolean) => void;
  onNotice: (message: string) => void;
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
