import type { MatchRepository } from "../storage/match-repository.js";
import type { CricketProvider, ProviderQuery } from "./provider.js";
import type { Match } from "../domain/types.js";

export class RepositoryProvider implements CricketProvider {
  readonly id = "repository";

  constructor(private readonly repository: MatchRepository) {}

  listMatches(query?: ProviderQuery): Promise<Match[]> {
    return this.repository.list(query);
  }

  getMatch(matchId: string): Promise<Match | undefined> {
    return this.repository.get(matchId);
  }
}