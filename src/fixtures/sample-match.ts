import type { ProviderMatchPayload } from "../normalization/normalize.js";

export const sampleMatch: ProviderMatchPayload = {
  id: "fixture-aus-vs-ind-t20-001",
  competition: {
    id: "fixture-series-2026",
    name: "Development T20 Series",
    season: "2026"
  },
  format: "t20",
  teams: [
    { id: "aus", name: "Australia", shortName: "AUS" },
    { id: "ind", name: "India", shortName: "IND" }
  ],
  venue: {
    name: "Example Cricket Ground",
    city: "Melbourne",
    country: "Australia",
    timezone: "Australia/Melbourne"
  },
  startsAt: "2026-09-05T09:30:00Z",
  status: "live",
  innings: [
    {
      id: "fixture-aus-vs-ind-t20-001-innings-1",
      battingTeamId: "aus",
      runs: 142,
      wickets: 4,
      overs: 17,
      balls: 3,
      declared: false
    }
  ],
  sourceUpdatedAt: "2026-09-05T10:58:00Z"
};