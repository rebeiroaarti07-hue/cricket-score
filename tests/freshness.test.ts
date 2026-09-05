import assert from "node:assert/strict";
import test from "node:test";
import { getFreshness } from "../src/domain/freshness.js";

const now = new Date("2026-09-05T11:00:00.000Z");

test("classifies active scores by age", () => {
  assert.equal(getFreshness({ status: "live", fetchedAt: "2026-09-05T10:59:30Z" }, now).state, "live");
  assert.equal(getFreshness({ status: "live", fetchedAt: "2026-09-05T10:57:00Z" }, now).state, "delayed");
  assert.equal(getFreshness({ status: "live", fetchedAt: "2026-09-05T10:50:00Z" }, now).state, "stale");
});

test("completed matches do not become stale", () => {
  const result = getFreshness({ status: "completed", fetchedAt: "2026-09-05T08:00:00Z" }, now);

  assert.equal(result.state, "completed");
  assert.equal(result.ageSeconds, 10800);
});