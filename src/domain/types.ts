export type MatchStatus =
  | "scheduled"
  | "live"
  | "completed"
  | "abandoned"
  | "delayed"
  | "cancelled";

export type CricketFormat = "test" | "odi" | "t20" | "the100" | "other";

export interface Team {
  id: string;
  name: string;
  shortName: string;
}

export interface Competition {
  id: string;
  name: string;
  season?: string;
}

export interface Venue {
  name: string;
  city?: string;
  country?: string;
  timezone?: string;
}

export interface InningsScore {
  id: string;
  battingTeamId: string;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  target?: number;
  declared: boolean;
}

export interface Match {
  id: string;
  sport: "cricket";
  competition: Competition;
  format: CricketFormat;
  teams: [Team, Team];
  venue?: Venue;
  startsAt: string;
  status: MatchStatus;
  result?: string;
  innings: InningsScore[];
  source: string;
  fetchedAt: string;
  sourceUpdatedAt?: string;
}

export interface ProviderCapabilities {
  liveScores: boolean;
  competitions: string[];
  ballByBall: boolean;
}

export interface ProviderApproval {
  approved: boolean;
  termsUrl?: string;
  reviewedAt?: string;
  redistributionAllowed: boolean;
  attribution?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  enabled: boolean;
  approval: ProviderApproval;
  capabilities: ProviderCapabilities;
}