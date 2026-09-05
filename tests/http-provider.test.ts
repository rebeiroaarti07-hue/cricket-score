import assert from "node:assert/strict";
import test from "node:test";
import { sampleMatch } from "../src/fixtures/sample-match.js";
import { HttpCricketProvider, ProviderHttpError } from "../src/providers/http-provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("HTTP provider maps approved-provider envelopes through normalization", async () => {
  const requests: Request[] = [];
  const provider = new HttpCricketProvider({
    id: "approved-provider",
    baseUrl: "https://provider.example/v1/",
    apiKey: "test-key",
    fetchImpl: async (input, init) => {
      requests.push(new Request(input, init));
      return response({ data: [sampleMatch] });
    }
  });

  const matches = await provider.listMatches({ status: "live", date: "2026-09-05" });

  assert.equal(matches[0]?.source, "approved-provider");
  assert.equal(requests[0]?.url, "https://provider.example/v1/matches?status=live&date=2026-09-05");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer test-key");
});

test("HTTP provider rejects upstream failures with retryability metadata", async () => {
  const provider = new HttpCricketProvider({
    id: "approved-provider",
    baseUrl: "https://provider.example/v1/",
    fetchImpl: async () => response({ error: "quota" }, 429)
  });

  await assert.rejects(
    () => provider.listMatches(),
    (error: unknown) => error instanceof ProviderHttpError && error.status === 429 && error.retryable
  );
});

test("HTTP provider rejects malformed response envelopes", async () => {
  const provider = new HttpCricketProvider({
    id: "approved-provider",
    baseUrl: "https://provider.example/v1/",
    fetchImpl: async () => response({ matches: [] })
  });

  await assert.rejects(() => provider.listMatches(), /data must be an array/);
});

test("HTTP provider aborts requests that exceed the configured timeout", async () => {
  const provider = new HttpCricketProvider({
    id: "approved-provider",
    baseUrl: "https://provider.example/v1/",
    timeoutMs: 100,
    fetchImpl: async (_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  });

  await assert.rejects(
    () => provider.listMatches(),
    (error: unknown) => error instanceof ProviderHttpError && error.retryable && /timed out/.test(error.message)
  );
});