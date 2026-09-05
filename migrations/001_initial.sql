CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  timezone TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL CHECK (sport = 'cricket'),
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  format TEXT NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  venue_id TEXT REFERENCES venues(id),
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  innings JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  source_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_status_starts_at_idx ON matches(status, starts_at);
CREATE INDEX IF NOT EXISTS matches_competition_starts_at_idx ON matches(competition_id, starts_at);

CREATE TABLE IF NOT EXISTS score_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  source_updated_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS score_snapshots_match_fetched_idx
  ON score_snapshots(match_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS provider_mappings (
  provider_id TEXT NOT NULL,
  provider_match_id TEXT NOT NULL,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, provider_match_id),
  UNIQUE (provider_id, match_id)
);