import type { Match } from "./types.js";

export type FreshnessState = "live" | "delayed" | "stale" | "completed" | "unavailable";

export interface FreshnessInfo {
  state: FreshnessState;
  fetchedAt: string;
  ageSeconds: number;
}

export interface FreshnessThresholds {
  liveSeconds: number;
  staleSeconds: number;
}

export const defaultFreshnessThresholds: FreshnessThresholds = {
  liveSeconds: 90,
  staleSeconds: 300
};

export function getFreshness(
  match: Pick<Match, "status" | "fetchedAt">,
  now: Date,
  thresholds: FreshnessThresholds = defaultFreshnessThresholds
): FreshnessInfo {
  const fetchedAt = new Date(match.fetchedAt);
  const ageSeconds = Math.max(0, (now.getTime() - fetchedAt.getTime()) / 1000);

  if (match.status === "completed" || match.status === "abandoned" || match.status === "cancelled") {
    return { state: "completed", fetchedAt: fetchedAt.toISOString(), ageSeconds };
  }

  if (ageSeconds <= thresholds.liveSeconds) {
    return { state: "live", fetchedAt: fetchedAt.toISOString(), ageSeconds };
  }

  if (ageSeconds <= thresholds.staleSeconds) {
    return { state: "delayed", fetchedAt: fetchedAt.toISOString(), ageSeconds };
  }

  return { state: "stale", fetchedAt: fetchedAt.toISOString(), ageSeconds };
}