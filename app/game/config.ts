import type { GameSettings, MissionDefinition } from "./types";

export const MISSIONS: MissionDefinition[] = [
  {
    id: "first-light",
    index: "01",
    callsign: "FIRST LIGHT",
    title: "Border reconnaissance",
    summary: "Low-level insertion through the Kestrel valley. Confirm three signal sites and return below the radar envelope.",
    location: "Kestrel Valley · Sector 04",
    risk: "moderate",
    timeOfDay: 6.4,
    weather: "haze",
    objective: "Reach the northern observation zone",
  },
  {
    id: "broken-spear",
    index: "02",
    callsign: "BROKEN SPEAR",
    title: "Armoured interdiction",
    summary: "Locate a mobile air-defence column crossing the plateau and disable it before it reaches the city perimeter.",
    location: "Meridian Plateau · Sector 11",
    risk: "high",
    timeOfDay: 17.7,
    weather: "clear",
    objective: "Approach the interdiction area",
  },
  {
    id: "silent-river",
    index: "03",
    callsign: "SILENT RIVER",
    title: "Night extraction",
    summary: "Penetrate a storm front, reach the river compound, and hold a stable hover for the recovery team.",
    location: "Orison River · Sector 19",
    risk: "extreme",
    timeOfDay: 22.2,
    weather: "storm",
    objective: "Navigate to the extraction beacon",
  },
];

export const DEFAULT_SETTINGS: GameSettings = {
  flightAssist: true,
  mouseSensitivity: 0.72,
  controllerDeadzone: 0.12,
  invertY: false,
  masterVolume: 0.72,
  quality: "auto",
};

export const CONTROL_REFERENCE = [
  ["Cyclic pitch", "W / S · Left stick Y"],
  ["Cyclic roll", "A / D · Left stick X"],
  ["Anti-torque pedals", "Q / E · LB / RB"],
  ["Collective", "Shift / Ctrl · RT / LT"],
  ["Primary weapon", "Left click / Space · A"],
  ["Secondary weapon", "Right click · B"],
  ["Cycle secondary", "R · X"],
  ["Cycle target", "Tab · D-pad up"],
  ["Change camera", "C · Y"],
  ["Hover assist", "H · Left stick click"],
  ["Pause", "P / Esc · Menu"],
  ["Fullscreen", "F11"],
] as const;
