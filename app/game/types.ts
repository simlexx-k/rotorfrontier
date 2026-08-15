export type MissionId = "first-light" | "broken-spear" | "silent-river";
export type CameraMode = "chase" | "cockpit" | "cinematic";
export type WeatherMode = "clear" | "haze" | "storm";
export type InputDevice = "keyboard-mouse" | "gamepad";
export type GamePhase = "menu" | "loading" | "playing" | "paused" | "debrief";

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
}
