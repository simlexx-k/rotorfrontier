import { get, set } from "idb-keyval";
import { z } from "zod";
import type { CareerProfile, MissionResult } from "./types";

const KEY = "rotorfrontier.career.v1";

const profileSchema = z.object({
  version: z.literal(1),
  callsign: z.string(),
  level: z.number().int().min(1),
  xp: z.number().min(0),
  credits: z.number().min(0),
  completedMissions: z.array(z.enum(["first-light", "broken-spear", "silent-river"])),
  upgrades: z.object({
    engine: z.number().int().min(0).max(5),
    armour: z.number().int().min(0).max(5),
    sensors: z.number().int().min(0).max(5),
    weapons: z.number().int().min(0).max(5),
  }),
  statistics: z.object({
    sorties: z.number().int().min(0),
    victories: z.number().int().min(0),
    kills: z.number().int().min(0),
    flightSeconds: z.number().min(0),
    bestScore: z.number().min(0),
  }),
});

export const DEFAULT_CAREER: CareerProfile = {
  version: 1,
  callsign: "RAVEN 01",
  level: 1,
  xp: 0,
  credits: 2500,
  completedMissions: [],
  upgrades: { engine: 0, armour: 0, sensors: 0, weapons: 0 },
  statistics: { sorties: 0, victories: 0, kills: 0, flightSeconds: 0, bestScore: 0 },
};

export async function loadCareer(): Promise<CareerProfile> {
  try {
    const stored = await get<unknown>(KEY);
    const parsed = profileSchema.safeParse(stored);
    return parsed.success ? parsed.data : DEFAULT_CAREER;
  } catch {
    try {
      const local = JSON.parse(localStorage.getItem(KEY) ?? "null");
      const parsed = profileSchema.safeParse(local);
      return parsed.success ? parsed.data : DEFAULT_CAREER;
    } catch {
      return DEFAULT_CAREER;
    }
  }
}

export async function saveCareer(profile: CareerProfile) {
  try {
    await set(KEY, profile);
  } catch {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }
}

export function upgradeCost(level: number) {
  return 1400 + level * level * 950;
}

export function purchaseUpgrade(
  profile: CareerProfile,
  system: keyof CareerProfile["upgrades"],
): CareerProfile | null {
  const current = profile.upgrades[system];
  if (current >= 5) return null;
  const cost = upgradeCost(current);
  if (profile.credits < cost) return null;
  return {
    ...profile,
    credits: profile.credits - cost,
    upgrades: { ...profile.upgrades, [system]: current + 1 },
  };
}

export function applyMissionResult(
  profile: CareerProfile,
  result: MissionResult,
): CareerProfile {
  const xp = profile.xp + result.xp;
  const level = Math.max(profile.level, Math.floor(xp / 2500) + 1);
  const completed = result.success
    ? Array.from(new Set([...profile.completedMissions, result.missionId]))
    : profile.completedMissions;
  return {
    ...profile,
    level,
    xp,
    credits: profile.credits + result.credits,
    completedMissions: completed,
    statistics: {
      sorties: profile.statistics.sorties + 1,
      victories: profile.statistics.victories + (result.success ? 1 : 0),
      kills: profile.statistics.kills + result.kills,
      flightSeconds: profile.statistics.flightSeconds + result.flightTime,
      bestScore: Math.max(profile.statistics.bestScore, result.score),
    },
  };
}
