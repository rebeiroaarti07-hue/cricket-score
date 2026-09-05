import { Pool, type PoolClient } from "pg";
import type { Match, Team, Venue } from "../domain/types.js";
import type { ProviderQuery } from "../providers/provider.js";
import type { MatchRepository } from "./match-repository.js";

type MatchRow = {
  id: string;
  sport: "cricket";
  competition_id: string;
  competition_name: string;
  competition_season: string | null;
  format: Match["format"];
  home_team_id: string;
  home_team_name: string;
  home_team_short_name: string;
  away_team_id: string;
  away_team_name: string;
  away_team_short_name: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  venue_timezone: string | null;
  starts_at: Date;
  status: Match["status"];
  result: string | null;
  innings: Match["innings"];
  source: string;
  fetched_at: Date;
  source_updated_at: Date | null;
};

function venueId(venue: Venue): string {
  return [venue.name, venue.city, venue.country].filter(Boolean).join("|").toLowerCase();
}

function toMatch(row: MatchRow): Match {
  const teams: [Team, Team] = [
    { id: row.home_team_id, name: row.home_team_name, shortName: row.home_team_short_name },
    { id: row.away_team_id, name: row.away_team_name, shortName: row.away_team_short_name }
  ];
  const venue = row.venue_name
    ? {
        name: row.venue_name,
        ...(row.venue_city ? { city: row.venue_city } : {}),
        ...(row.venue_country ? { country: row.venue_country } : {}),
        ...(row.venue_timezone ? { timezone: row.venue_timezone } : {})
      }
    : undefined;

  return {
    id: row.id,
    sport: row.sport,
    competition: {
      id: row.competition_id,
      name: row.competition_name,
      ...(row.competition_season ? { season: row.competition_season } : {})
    },
    format: row.format,
    teams,
    ...(venue ? { venue } : {}),
    startsAt: row.starts_at.toISOString(),
    status: row.status,
    ...(row.result ? { result: row.result } : {}),
    innings: row.innings,
    source: row.source,
    fetchedAt: row.fetched_at.toISOString(),
    ...(row.source_updated_at ? { sourceUpdatedAt: row.source_updated_at.toISOString() } : {})
  };
}

const selectMatches = `
  SELECT
    m.id, m.sport, m.competition_id, c.name AS competition_name, c.season AS competition_season,
    m.format, ht.id AS home_team_id, ht.name AS home_team_name, ht.short_name AS home_team_short_name,
    at.id AS away_team_id, at.name AS away_team_name, at.short_name AS away_team_short_name,
    v.name AS venue_name, v.city AS venue_city, v.country AS venue_country, v.timezone AS venue_timezone,
    m.starts_at, m.status, m.result, m.innings, m.source, m.fetched_at, m.source_updated_at
  FROM matches m
  JOIN competitions c ON c.id = m.competition_id
  JOIN teams ht ON ht.id = m.home_team_id
  JOIN teams at ON at.id = m.away_team_id
  LEFT JOIN venues v ON v.id = m.venue_id
`;

export class PostgresMatchRepository implements MatchRepository {
  constructor(private readonly pool: Pool) {}

  async replace(matches: Match[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const match of matches) {
        await this.upsertMatch(client, match);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(query?: ProviderQuery): Promise<Match[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query?.status) {
      values.push(query.status === "upcoming" ? "scheduled" : query.status);
      conditions.push(`m.status = $${values.length}`);
    }
    if (query?.date) {
      values.push(query.date);
      conditions.push(`m.starts_at >= $${values.length}::date AND m.starts_at < ($${values.length}::date + interval '1 day')`);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query<MatchRow>(`${selectMatches}${where} ORDER BY m.starts_at ASC`, values);
    return result.rows.map(toMatch);
  }

  async get(matchId: string): Promise<Match | undefined> {
    const result = await this.pool.query<MatchRow>(`${selectMatches} WHERE m.id = $1`, [matchId]);
    const row = result.rows[0];
    return row ? toMatch(row) : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async upsertMatch(client: PoolClient, match: Match): Promise<void> {
    await client.query(
      `INSERT INTO competitions (id, name, season) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, season = EXCLUDED.season`,
      [match.competition.id, match.competition.name, match.competition.season ?? null]
    );
    for (const team of match.teams) {
      await client.query(
        `INSERT INTO teams (id, name, short_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name`,
        [team.id, team.name, team.shortName]
      );
    }

    const storedVenueId = match.venue ? venueId(match.venue) : null;
    if (match.venue && storedVenueId) {
      await client.query(
        `INSERT INTO venues (id, name, city, country, timezone) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city,
           country = EXCLUDED.country, timezone = EXCLUDED.timezone`,
        [storedVenueId, match.venue.name, match.venue.city ?? null, match.venue.country ?? null, match.venue.timezone ?? null]
      );
    }

    await client.query(
      `INSERT INTO matches (
        id, sport, competition_id, format, home_team_id, away_team_id, venue_id,
        starts_at, status, result, innings, source, fetched_at, source_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET competition_id = EXCLUDED.competition_id,
        format = EXCLUDED.format, home_team_id = EXCLUDED.home_team_id,
        away_team_id = EXCLUDED.away_team_id, venue_id = EXCLUDED.venue_id,
        starts_at = EXCLUDED.starts_at, status = EXCLUDED.status, result = EXCLUDED.result,
        innings = EXCLUDED.innings, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at,
        source_updated_at = EXCLUDED.source_updated_at, updated_at = now()`,
      [
        match.id,
        match.sport,
        match.competition.id,
        match.format,
        match.teams[0].id,
        match.teams[1].id,
        storedVenueId,
        match.startsAt,
        match.status,
        match.result ?? null,
        JSON.stringify(match.innings),
        match.source,
        match.fetchedAt,
        match.sourceUpdatedAt ?? null
      ]
    );
    await client.query(
      `INSERT INTO score_snapshots (match_id, source, fetched_at, source_updated_at, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [match.id, match.source, match.fetchedAt, match.sourceUpdatedAt ?? null, JSON.stringify(match)]
    );
  }
}