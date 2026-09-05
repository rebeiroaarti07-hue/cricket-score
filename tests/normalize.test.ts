import assert from "node:assert/strict";
import test from "node:test";
import { sampleMatch } from "../src/fixtures/sample-match.js";
import { normalizeMatch } from "../src/normalization/normalize.js";

test("normalizes a provider match into the stable cricket contract", () => {
  const match = normalizeMatch(sampleMatch, "2026-09-05T11:00:00Z", "fixture");

  assert.equal(match.id, "fixture-aus-vs-ind-t20-001");
  assert.equal(match.sport, "cricket");
  assert.equal(match.format, "t20");
  assert.equal(match.status, "live");
  assert.deepEqual(match.teams.map((team) => team.shortName), ["AUS", "IND"]);
  assert.equal(match.innings[0]?.runs, 142);
  assert.equal(match.fetchedAt, "2026-09-05T11:00:00.000Z");
});

test("rejects provider payloads without exactly two teams", () => {
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, teams: [sampleMatch.teams[0]!] }, "2026-09-05T11:00:00Z", "fixture"),
    /exactly two teams/
  );
});

test("rejects unknown statuses instead of silently misclassifying them", () => {
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, status: "unknown" }, "2026-09-05T11:00:00Z", "fixture"),
    /unsupported match status/
  );
});

test("rejects invalid timestamps and score values at the provider boundary", () => {
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, startsAt: "not-a-date" }, "2026-09-05T11:00:00Z", "fixture"),
    /invalid start time/
  );
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, innings: [{ ...sampleMatch.innings![0]!, runs: -1 }] }, "2026-09-05T11:00:00Z", "fixture"),
    /invalid runs/
  );
});

test("rejects duplicate teams and innings for unknown teams", () => {
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, teams: [sampleMatch.teams[0]!, sampleMatch.teams[0]!] }, "2026-09-05T11:00:00Z", "fixture"),
    /duplicate team IDs/
  );
  assert.throws(
    () => normalizeMatch({ ...sampleMatch, innings: [{ ...sampleMatch.innings![0]!, battingTeamId: "missing" }] }, "2026-09-05T11:00:00Z", "fixture"),
    /unknown batting team/
  );
});