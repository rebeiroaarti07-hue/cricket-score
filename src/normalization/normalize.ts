import type {
  CricketFormat,
  InningsScore,
  Match,
  MatchStatus,
  Team
} from "../domain/types.js";

export interface ProviderMatchPayload {
  id: string;
  competition: { id: string; name: string; season?: string };
  format: string;
  teams: Array<{ id: string; name: string; shortName?: string }>;
  venue?: { name: string; city?: string; country?: string; timezone?: string };
  startsAt: string;
  status: string;
  result?: string;
  innings?: Array<{
    id: string;
    battingTeamId: string;
    runs: number;
    wickets: number;
    overs: number;
    balls: number;
    target?: number;
    declared?: boolean;
  }>;
  sourceUpdatedAt?: string;
}

const formats = new Set<CricketFormat>(["test", "odi", "t20", "the100", "other"]);
const statuses = new Set<MatchStatus>([
  "scheduled",
  "live",
  "completed",
  "abandoned",
  "delayed",
  "cancelled"
]);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Provider payload has an empty ${field}`);
  }
  return value;
}

function validDate(value: unknown, field: string): string {
  const date = new Date(typeof value === "string" ? value : "");
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Provider payload has an invalid ${field}`);
  }
  return date.toISOString();
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Provider payload has an invalid ${field}`);
  }
  return value;
}

function boundedInteger(value: unknown, field: string, maximum: number): number {
  const number = nonNegativeNumber(value, field);
  if (!Number.isInteger(number) || number > maximum) {
    throw new Error(`Provider payload has an invalid ${field}`);
  }
  return number;
}

function normalizeFormat(value: string): CricketFormat {
  return formats.has(value as CricketFormat) ? (value as CricketFormat) : "other";
}

function normalizeStatus(value: string): MatchStatus {
  if (!statuses.has(value as MatchStatus)) {
    throw new Error(`Provider payload has unsupported match status: ${value}`);
  }
  return value as MatchStatus;
}

function normalizeTeam(team: ProviderMatchPayload["teams"][number]): Team {
  return {
    id: requiredString(team.id, "team id"),
    name: requiredString(team.name, "team name"),
    shortName: team.shortName?.trim() || team.name.slice(0, 3).toUpperCase()
  };
}

function normalizeInnings(innings: ProviderMatchPayload["innings"]): InningsScore[] {
  return (innings ?? []).map((score) => ({
    id: requiredString(score.id, "innings id"),
    battingTeamId: requiredString(score.battingTeamId, "batting team id"),
    runs: nonNegativeNumber(score.runs, "runs"),
    wickets: boundedInteger(score.wickets, "wickets", 10),
    overs: nonNegativeNumber(score.overs, "overs"),
    balls: boundedInteger(score.balls, "balls", 5),
    ...(score.target === undefined ? {} : { target: nonNegativeNumber(score.target, "target") }),
    declared: score.declared ?? false
  }));
}

export function normalizeMatch(payload: ProviderMatchPayload, fetchedAt: string, source: string): Match {
  requiredString(payload.id, "match id");
  if (payload.teams.length !== 2) {
    throw new Error(`Provider payload must contain exactly two teams for match ${payload.id}`);
  }

  const teams = payload.teams.map(normalizeTeam) as [Team, Team];
  if (new Set(teams.map((team) => team.id)).size !== teams.length) {
    throw new Error(`Provider payload has duplicate team IDs for match ${payload.id}`);
  }
  const teamIds = new Set(teams.map((team) => team.id));
  const normalizedInnings = normalizeInnings(payload.innings);
  if (normalizedInnings.some((innings) => !teamIds.has(innings.battingTeamId))) {
    throw new Error(`Provider payload has an innings for an unknown batting team in match ${payload.id}`);
  }
  const venue = payload.venue
    ? {
        name: requiredString(payload.venue.name, "venue name"),
        ...(payload.venue.city ? { city: payload.venue.city } : {}),
        ...(payload.venue.country ? { country: payload.venue.country } : {}),
        ...(payload.venue.timezone ? { timezone: payload.venue.timezone } : {})
      }
    : undefined;

  return {
    id: requiredString(payload.id, "match id"),
    sport: "cricket",
    competition: {
      id: requiredString(payload.competition.id, "competition id"),
      name: requiredString(payload.competition.name, "competition name"),
      ...(payload.competition.season ? { season: payload.competition.season } : {})
    },
    format: normalizeFormat(payload.format),
    teams,
    ...(venue ? { venue } : {}),
    startsAt: validDate(payload.startsAt, "start time"),
    status: normalizeStatus(payload.status),
    ...(payload.result ? { result: payload.result } : {}),
    innings: normalizedInnings,
    source: requiredString(source, "source"),
    fetchedAt: validDate(fetchedAt, "fetched time"),
    ...(payload.sourceUpdatedAt
      ? { sourceUpdatedAt: validDate(payload.sourceUpdatedAt, "source update time") }
      : {})
  };
}