import type { Match } from "../domain/types.js";
import { sampleMatch } from "../fixtures/sample-match.js";
import { normalizeMatch } from "../normalization/normalize.js";
import type { CricketProvider, ProviderQuery } from "./provider.js";

export class FixtureProvider implements CricketProvider {
  readonly id = "fixture";

  private readonly match = normalizeMatch(sampleMatch, "2026-09-05T11:00:00Z", this.id);

  async listMatches(query?: ProviderQuery): Promise<Match[]> {
    if (query?.status === "live" && this.match.status !== "live") {
      return [];
    }

    if (query?.status === "completed" && this.match.status !== "completed") {
      return [];
    }

    if (query?.status === "upcoming" && this.match.status !== "scheduled") {
      return [];
    }

    if (query?.date && !this.match.startsAt.startsWith(query.date)) {
      return [];
    }

    return [this.match];
  }

  async getMatch(matchId: string): Promise<Match | undefined> {
    return matchId === this.match.id ? this.match : undefined;
  }
}