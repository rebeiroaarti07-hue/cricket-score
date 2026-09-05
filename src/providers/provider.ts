import type { Match } from "../domain/types.js";

export interface ProviderQuery {
  status?: "live" | "upcoming" | "completed";
  date?: string;
}

export interface CricketProvider {
  readonly id: string;
  listMatches(query?: ProviderQuery): Promise<Match[]>;
  getMatch(matchId: string): Promise<Match | undefined>;
}