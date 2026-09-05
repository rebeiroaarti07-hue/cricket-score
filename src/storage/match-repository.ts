import type { Match } from "../domain/types.js";
import type { ProviderQuery } from "../providers/provider.js";

export interface MatchRepository {
  replace(matches: Match[]): Promise<void>;
  list(query?: ProviderQuery): Promise<Match[]>;
  get(matchId: string): Promise<Match | undefined>;
}

function matchesQuery(match: Match, query?: ProviderQuery): boolean {
  if (query?.status === "live" && match.status !== "live") return false;
  if (query?.status === "completed" && match.status !== "completed") return false;
  if (query?.status === "upcoming" && match.status !== "scheduled") return false;
  if (query?.date && !match.startsAt.startsWith(query.date)) return false;
  return true;
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, Match>();

  async replace(matches: Match[]): Promise<void> {
    for (const match of matches) {
      this.matches.set(match.id, match);
    }
  }

  async list(query?: ProviderQuery): Promise<Match[]> {
    return [...this.matches.values()].filter((match) => matchesQuery(match, query));
  }

  async get(matchId: string): Promise<Match | undefined> {
    return this.matches.get(matchId);
  }
}