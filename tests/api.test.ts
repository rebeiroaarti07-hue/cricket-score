import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { createApiServer } from "../src/api/server.js";
import { FixtureProvider } from "../src/providers/fixture-provider.js";

function requestJson(port: number, path: string): Promise<{ status: number; body: any; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const clientRequest = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({ status: response.statusCode ?? 0, body: JSON.parse(body), headers: response.headers });
      });
    });
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

test("API serves health, filtered matches, and match details", async (context) => {
  const server = createApiServer(new FixtureProvider(), () => new Date("2026-09-05T11:10:00Z"));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const health = await requestJson(address.port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.provider, "fixture");
  assert.equal(health.body.liveProviderEnabled, false);

  const matches = await requestJson(address.port, "/api/matches?status=live");
  assert.equal(matches.status, 200);
  assert.equal(matches.body.meta.count, 1);
  assert.equal(matches.headers["x-content-type-options"], "nosniff");
  assert.equal(matches.headers["referrer-policy"], "no-referrer");
  assert.equal(matches.body.data[0].freshness.state, "stale");

  const matchId = matches.body.data[0].id;
  const detail = await requestJson(address.port, `/api/matches/${matchId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.id, matchId);
  assert.equal(detail.body.data.fetchedAt, "2026-09-05T11:00:00.000Z");
  assert.equal(detail.body.data.freshness.state, "stale");
});

test("API reports invalid filters and missing routes clearly", async (context) => {
  const server = createApiServer(new FixtureProvider());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const invalid = await requestJson(address.port, "/api/matches?status=tomorrow");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "invalid_query");

  const missing = await requestJson(address.port, "/api/matches/missing");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "match_not_found");

  const route = await requestJson(address.port, "/unknown");
  assert.equal(route.status, 404);
  assert.equal(route.body.error, "route_not_found");
});