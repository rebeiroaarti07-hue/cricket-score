import assert from "node:assert/strict";
import test from "node:test";
import { FixtureProvider } from "../src/providers/fixture-provider.js";

test("fixture provider supports match listing and lookup", async () => {
  const provider = new FixtureProvider();
  const liveMatches = await provider.listMatches({ status: "live" });

  assert.equal(liveMatches.length, 1);
  assert.equal(liveMatches[0]?.source, "fixture");
  assert.equal(await provider.getMatch(liveMatches[0]!.id), liveMatches[0]);
  assert.equal(await provider.getMatch("missing-match"), undefined);
});

test("fixture provider filters by date", async () => {
  const provider = new FixtureProvider();

  assert.equal((await provider.listMatches({ date: "2026-09-05" })).length, 1);
  assert.equal((await provider.listMatches({ date: "2026-09-06" })).length, 0);
});