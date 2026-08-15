import type { AircraftDefinition, GameSettings, MissionDefinition } from "./types";

export const ACTIVE_AIRCRAFT: AircraftDefinition = {
  id: "ah-64e-guardian",
  designation: "AH-64E",
  name: "Apache Guardian",
  manufacturer: "Boeing",
  role: "Heavy attack helicopter",
  crew: 2,
  dimensions: {
    lengthMetres: 14.7,
    heightMetres: 4.7,
    rotorDiameterMetres: 14.6,
  },
  weights: {
    missionGrossKg: 6_838,
    maximumOperatingKg: 10_433,
  },
  performance: {
    maximumSpeedKnots: 164,
    combatRangeNm: 260,
    enduranceHours: 2.6,
    climbRateMpm: 853,
  },
  propulsion: {
    count: 2,
    model: "T700-GE-701D",
    shaftHorsepowerEach: 2_000,
  },
  armament: [
    "M230 30 mm chain gun · 1,200 rounds",
    "AGM-114 Hellfire · up to 16",
    "Hydra 70 rockets · up to 76",
  ],
  systems: [
    "TADS/PNVS target acquisition and night vision",
    "AN/APG-78 Longbow fire-control radar",
    "Digital glass cockpit and Link 16 interoperability",
  ],
  sources: [
    { label: "Boeing specifications", href: "https://www.boeing.com/defense/military-rotorcraft/ah-64-apache" },
    { label: "U.S. Army performance", href: "https://www.army.mil/article/137579/ah_64e_apache_attack_helicopter" },
    { label: "GE T700 engine", href: "https://www.geaerospace.com/military-defense/engines/t700" },
  ],
  modelCredit: {
    creator: "Jeyhun1985",
    href: "https://sketchfab.com/3d-models/ah-64e-apache-guardian-9eb641f9179d413e87367ebd9b96347a",
    license: "CC BY 4.0",
    licenseHref: "https://creativecommons.org/licenses/by/4.0/",
  },
};

export const MISSIONS: MissionDefinition[] = [
  {
    id: "first-light",
    index: "01",
    callsign: "CLEAR HORIZON",
    title: "Daylight reconnaissance",
    summary: "Clear-day low-level reconnaissance across central Nairobi. Confirm three signal sites and return below the radar envelope.",
    location: "Nairobi Region · Kenya",
    risk: "moderate",
    timeOfDay: 12.5,
    weather: "clear",
    objective: "Reach the northern observation zone",
  },
  {
    id: "broken-spear",
    index: "02",
    callsign: "BROKEN SPEAR",
    title: "Armoured interdiction",
    summary: "Locate a mobile air-defence column crossing Nairobi's southern approaches and disable it before it reaches the city perimeter.",
    location: "Nairobi Region · Kenya",
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
    summary: "Penetrate a storm front over the Nairobi River corridor and hold a stable hover for the recovery team.",
    location: "Nairobi Region · Kenya",
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
  realTerrain: true,
  mapProvider: "open",
  mapToken: "",
};

export const CONTROL_REFERENCE = [
  ["Cyclic pitch", "W / S · Left stick Y"],
  ["Cyclic roll", "A / D · Left stick X"],
  ["Anti-torque pedals", "Q / E · LB / RB"],
  ["Collective raise / lower", "Shift / Ctrl · RT / LT"],
  ["Primary weapon", "Left click / Space · A"],
  ["Secondary weapon", "Right click · B"],
  ["Cycle secondary", "R · X"],
  ["Cycle target", "Tab · D-pad up"],
  ["Change camera", "C · Y"],
  ["Hover assist", "H · Left stick click"],
  ["Pause", "P / Esc · Menu"],
  ["Fullscreen", "F11"],
] as const;
