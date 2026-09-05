import assert from "node:assert/strict";
import test from "node:test";
import { sampleMatch } from "../src/fixtures/sample-match.js";
import { normalizeMatch } from "../src/normalization/normalize.js";
import { IngestionCoordinator } from "../src/application/ingestion.js";
import type { CricketProvider } from "../src/providers/provider.js";
import { InMemoryMatchRepository } from "../src/storage/match-repository.js";

const match = normalizeMatch(sampleMatch, "2026-09-05T11:00:00Z", "fixture");

test("ingestion retries transient provider failures and persists the projection", async () => {
  let calls = 0;
  const provider: CricketProvider = {
    id: "test-provider",
    async listMatches() {
      calls += 1;
      if (calls < 3) throw new Error("temporary provider failure");
      return [match];
    },
    async getMatch() {
      return match;
    }
  };
  const repository = new InMemoryMatchRepository();
  const delays: number[] = [];
  const coordinator = new IngestionCoordinator(provider, repository, {
    retryDelayMs: 10,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    }
  });

  const result = await coordinator.refresh();

  assert.equal(result.attempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.equal((await repository.get(match.id))?.id, match.id);
});

test("failed refreshes preserve the last known good projection", async () => {
  const repository = new InMemoryMatchRepository();
  await repository.replace([match]);
  const provider: CricketProvider = {
    id: "failing-provider",
    async listMatches() {
      throw new Error("provider unavailable");
    },
    async getMatch() {
      return undefined;
    }
  };
  const coordinator = new IngestionCoordinator(provider, repository, {
    maxAttempts: 2,
    sleep: async () => undefined
  });

  await assert.rejects(() => coordinator.refresh(), /provider unavailable/);
  assert.equal((await repository.get(match.id))?.fetchedAt, match.fetchedAt);
});

test("coalesces overlapping refresh calls", async () => {
  let resolveProvider: ((matches: typeof match[]) => void) | undefined;
  let providerCalls = 0;
  const provider: CricketProvider = {
    id: "slow-provider",
    listMatches: () => new Promise((resolve) => {
      providerCalls += 1;
      resolveProvider = resolve;
    }),
    async getMatch() {
      return match;
    }
  };
  const repository = new InMemoryMatchRepository();
  const coordinator = new IngestionCoordinator(provider, repository);
  const first = coordinator.refresh();
  const second = coordinator.refresh();

  assert.equal(providerCalls, 1);
  resolveProvider!([match]);
  assert.equal((await first).attempts, 1);
  assert.equal((await second).attempts, 1);
});