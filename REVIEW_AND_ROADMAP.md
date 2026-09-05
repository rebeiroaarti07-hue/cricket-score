# Cricket Score - Architectural Review & Strategic Roadmap

## 1. Executive Summary & Health Assessment

**Project context**

- **Core purpose:** A source-aware live cricket score tracker for people who want a concise view of live, upcoming, and completed matches. Cricket is the MVP, with a future path to other sports.
- **Current stack:** TypeScript 5.9, Node.js 24, native `node:http` server, `tsx` test/runtime execution, browser JavaScript/CSS, and no database, cache, queue, frontend framework, or deployment automation yet.
- **Maturity stage:** Prototype / early MVP foundation. The repository has a tested offline vertical slice, but it is not production-ready and has no approved live-score provider.
- **Primary architecture:** Provider interface -> normalized cricket domain model -> native HTTP API -> static browser dashboard.

### Overall System Maturity

| Dimension | Grade | Assessment |
|---|---:|---|
| Architecture | C+ | The provider and normalizer boundaries are a sound beginning, but there is no ingestion, persistence, cache, worker, or durable identity layer. |
| Code Quality | B- | Strict TypeScript, small modules, and readable contracts are positive. Runtime validation is incomplete and some behavior is hardcoded. |
| Maintainability | C+ | The code is small and easy to navigate today, but the API handler, static-file serving, response shaping, and provider selection are already converging in one module. |
| Performance | D+ | A fixture provider is fast, but there is no real performance architecture: no shared polling, cache, connection pooling, backpressure, or asset strategy. |
| Test Coverage | C | Ten tests cover normalizer, fixture provider, freshness, and HTTP happy/error paths. There are no browser E2E, security, property, load, provider-contract, or CI tests. |

### Architectural Philosophy

The current implementation has the right initial instinct: external provider payloads do not flow directly into the UI. `src/providers/provider.ts` defines a product-facing provider contract, `src/normalization/normalize.ts` converts external data into stable cricket types, and `src/domain/freshness.ts` keeps freshness logic out of the browser. This is a useful anti-corruption layer and should be preserved.

The fundamental risk is that the prototype currently looks like a complete application while still lacking the runtime systems that make live data reliable. `FixtureProvider` is the only implementation, `providerRegistry` contains no live provider, and `src/api/server.ts` calls a provider directly per request. There is no shared ingestion loop, durable score snapshot, cache, retry policy, quota accounting, or provider failover. Scaling the current shape by adding more API calls or more provider branches will create request amplification and inconsistent score state.

### Primary Bottlenecks

1. **No legally approved live data path:** The product cannot satisfy its core promise until a provider is verified for live coverage, free-tier limits, caching, attribution, and redistribution. This is a product and compliance blocker, not merely an integration task.
2. **No ingestion and persistence architecture:** The API reads directly from a provider abstraction. It cannot provide stable snapshots, serve during upstream outages, reconcile duplicates, or protect a provider from many browser clients polling independently.
3. **Unsafe and incomplete production boundary:** Provider-derived strings are interpolated into browser `innerHTML`, CORS is `*`, health reports `liveProviderEnabled: false` regardless of configuration, and external payload validation does not verify numeric ranges or invalid dates.

## 2. In-Depth Engineering Review

### Design Patterns & Modularity

**What is working**

- `CricketProvider` is a clear dependency-inversion point. The API accepts an interface rather than constructing a provider internally.
- `normalizeMatch` is a useful anti-corruption layer. The UI consumes `Match`, not an arbitrary upstream schema.
- `getFreshness` is pure and accepts an injected clock in API tests. This is a good pattern for time-dependent domain behavior.
- The provider registry models approval and capabilities, which aligns with the project's legal-source requirement.

**Structural concerns**

- `src/api/server.ts` owns HTTP routing, static-file serving, query parsing, response presentation, error classification, and freshness decoration. It is still small, but it is already a mixed-responsibility module and will become a bottleneck when authentication, caching, metrics, or more routes arrive.
- Provider selection is not actually driven by the registry. `src/api/index.ts` always constructs `new FixtureProvider()`, while the registry only exposes inspection helpers. This makes compliance metadata advisory rather than an enforcement boundary.
- `ProviderMatchPayload` lives in the normalizer module and is implicitly treated as a provider contract. Each real adapter needs a provider-specific transport type and boundary validation before normalization; otherwise adapter details leak into a shared type.
- The domain model is cricket-specific, which is correct for the MVP. A premature generic `Sport` abstraction would be harmful. The future cross-sport boundary should be an adapter/application-port boundary, not a generic score schema that erases sport-specific rules.
- There is no application/service layer. API routes call the provider directly, so polling, repository access, provider fallback, freshness policy, and authorization will otherwise be duplicated across handlers.
- The current match identity is simply the provider ID. Multi-provider reconciliation requires a canonical match identity and a mapping table; display names must not be used as identity.

### Data Architecture & Persistence

There is currently no database schema, migration system, repository, or cache. `FixtureProvider` stores one normalized match in memory, so process restart loses all state and multiple server instances cannot share data.

This is acceptable for an offline prototype but insufficient for live score tracking. The target architecture should separate:

- **Canonical entities:** competitions, teams, venues, matches, and provider mappings.
- **Mutable current state:** the latest match projection used by the read API.
- **Historical snapshots:** score observations with source, source update time, fetch time, and ingestion outcome.
- **Operational state:** provider quota, last success, last failure, latency, circuit state, and legal enablement.

A relational database such as PostgreSQL is the pragmatic first production choice. It provides constraints and transactional upserts for match identity and score snapshots. Redis is optional for a short-lived read cache and distributed locks; it should not become the system of record.

Required indexes include `(status, starts_at)`, `(competition_id, starts_at)`, normalized team/provider mapping keys, and `(match_id, fetched_at desc)` for snapshots. Snapshot retention must be consistent with provider terms. There is currently no migration hygiene, backup policy, retention job, or consistency guarantee to document.

### Error Handling & Fault Tolerance

Current behavior is intentionally minimal:

- malformed status and date query values return `400`;
- missing matches/routes return `404`;
- unexpected handler errors return a generic `500`;
- normalizer errors reject malformed team counts and unknown statuses.

The missing reliability behavior is substantial:

- no provider timeout or cancellation;
- no bounded retry with exponential backoff and jitter;
- no circuit breaker or per-provider disable switch at runtime;
- no rate-limit response handling or quota budget;
- no stale-cache fallback when upstream fails;
- no deduplication or idempotent upsert strategy;
- no validation that dates are real calendar dates or that timestamps are valid;
- no numeric validation for negative runs, wickets outside cricket rules, invalid overs/balls, or innings referencing an unknown team;
- `getFreshness` can receive an invalid timestamp and produce `NaN` age behavior rather than rejecting the record;
- `decodeURIComponent` can throw for malformed path encoding and is handled only as a generic server error.

For live data, errors should be represented as explicit operational states: `provider_unavailable`, `rate_limited`, `invalid_provider_payload`, `stale_cache`, or `coverage_unavailable`. A provider failure should not erase the last known good score.

### Observability & Diagnostics

There is no structured logging, metrics, tracing, request ID, provider latency measurement, or alerting hook. The only runtime output is the startup line in `src/api/index.ts`. This makes it impossible to answer basic production questions such as:

- Which provider supplied a score and when was it last successful?
- Are failures caused by the provider, normalization, database, or API?
- How many users are requesting the same match?
- Are we approaching free-tier quotas?
- How long does a live match remain stale?

Minimum instrumentation before production:

- structured JSON logs with request ID, route, status, latency, provider ID, match ID, and error category;
- counters for provider requests, successes, failures, rate limits, normalization failures, and cache hits;
- histograms for provider latency, API latency, and freshness age;
- gauges for provider circuit state and quota remaining where available;
- health/readiness endpoints that distinguish process health from provider readiness;
- redaction tests ensuring API keys and raw authorization headers never enter logs.

OpenTelemetry can be introduced after the service boundary is split, but useful metrics and structured logs should not wait for distributed tracing.

### Testing & Quality Assurance

The current tests are valuable contract tests, but they cover only the local path. Strengths include strict compilation, deterministic freshness tests, fixture-backed provider tests, and HTTP tests using real ephemeral sockets.

Important gaps:

- no test for invalid dates such as `2026-02-31` or invalid timestamps;
- no test for numeric/range validation, duplicate innings, unknown batting teams, or malformed venue data;
- no provider adapter contract suite that every approved provider must pass;
- no timeout, retry, rate-limit, circuit-breaker, or stale-cache tests;
- no persistence or migration tests because persistence does not exist;
- no browser tests, keyboard/accessibility tests, responsive smoke tests, or XSS tests;
- no load test for many clients requesting the same live match;
- no CI workflow, lint/format check, dependency audit, or coverage threshold;
- tests use `any` in `requestJson`, weakening the API test boundary;
- fixture timestamps are fixed and already become stale relative to current time, which is useful for testing but not representative of a continuously refreshed live feed.

The test suite is fast enough for per-commit execution. The next quality gain is not a large test count; it is adding boundary tests around untrusted data, provider failure modes, persistence semantics, and browser rendering.

## 3. Critical Modifications & Technical Debt Remediation

| Priority | Category | Component / Module | Issue / Technical Debt | Impact If Ignored | Recommended Fix |
|---|---|---|---|---|---|
| P0 | Security | `public/app.js` | Provider-derived team, competition, venue, and IDs are interpolated into `innerHTML`. | A compromised or malicious provider payload can execute script in every visitor's browser. | Render with `textContent`/DOM APIs or use a trusted templating strategy with escaping. Add an XSS regression test with malicious strings and a restrictive CSP. |
| P0 | Compliance / Product | `src/providers/registry.ts`, `src/api/index.ts` | The registry does not control provider construction; there is no approved live provider or verified source record. | The core product cannot legally or operationally claim live coverage. A future adapter could be enabled accidentally. | Introduce a `ProviderFactory` that refuses startup unless approval, redistribution, capability, terms URL, review date, and environment enablement all pass. Keep fixture mode explicit and non-production. |
| P0 | Reliability | `src/api/server.ts`, provider layer | Each API request can call upstream directly; there is no timeout, cache, polling worker, stale fallback, or quota protection. | Browser traffic multiplies provider calls, causes rate-limit failures, and leaves users without the last known score during an upstream outage. | Add an ingestion worker with bounded concurrency, per-provider timeout/retry/circuit breaker, durable latest projection, and API reads from storage/cache only. |
| P0 | Operations | `src/api/server.ts`, `src/api/index.ts` | No structured observability, readiness contract, or operational kill switch. | Incidents cannot be diagnosed, and an unhealthy provider may continue receiving traffic. | Add structured logs, metrics, request IDs, `/health/live`, `/health/ready`, provider health state, and an environment/config kill switch. |
| P1 | Input Validation | `src/normalization/normalize.ts`, `src/domain/freshness.ts` | `new Date()` values and score numbers are not validated; invalid timestamps can result in `NaN` freshness, and cricket invariants are unchecked. | Corrupt upstream data can poison persistence, produce misleading UI, or break sorting and polling decisions. | Validate external payloads with a schema library or explicit guards; reject invalid dates, finite non-negative scores, valid wickets, overs/balls, and team references. |
| P1 | API Security | `src/api/server.ts` | `Access-Control-Allow-Origin: *` is unconditional and there is no rate limiting or request-size/security-header policy. | Any origin can consume the API, increasing abuse and cost; browser hardening is weak. | Serve same-origin in production, allowlist required origins, add rate limiting at the edge/API, and set CSP, `X-Content-Type-Options`, `Referrer-Policy`, and frame protections. |
| P1 | Architecture | `src/api/server.ts` | Routing, static assets, query parsing, application calls, freshness presentation, and error mapping are coupled. | Adding detail fields, auth, cache, or more sports will turn one file into a high-change-risk module. | Split `router`, `match-service`, `response-mappers`, `static-assets`, and typed error middleware. Keep HTTP concerns out of domain code. |
| P1 | Persistence | New repository layer | No durable canonical match identity, current projection, snapshots, or provider mapping. | Restart loses data; multi-provider deduplication and historical reconciliation are impossible. | Add PostgreSQL schema/migrations with unique provider mappings, canonical match IDs, current score projection, append-only snapshots, and retention jobs. |
| P1 | Provider Contract | `src/providers/provider.ts` | The interface returns already-normalized `Match` values, leaving no standard place for provider metadata, quota state, source update time, partial coverage, or typed failures. | Adapters will invent inconsistent retry/error behavior and hide important operational information. | Return a typed `ProviderResult`/`ProviderError` envelope or move orchestration into a provider client port with capabilities, request cost, and source metadata. |
| P1 | Delivery | Repository root | No lint, formatting, coverage, dependency audit, CI, or deployment definition. | Regressions and insecure dependency/config changes can land unnoticed. | Add `npm run lint`, formatter, coverage threshold, GitHub Actions build/test/audit workflow, lockfile checks, and a container/deployment health check. |
| P2 | Domain Model | `src/domain/types.ts` | `Match` mixes canonical domain fields with transport provenance (`source`, `fetchedAt`). | Persistence and API contracts become coupled; future projections cannot model multiple observations cleanly. | Separate `CanonicalMatch`, `ScoreSnapshot`, and `MatchView`; keep provenance on observations/view metadata. |
| P2 | API Contract | `src/api/server.ts` | `presentMatch` has an inferred, ad hoc response shape and `requestJson` tests use `any`. | Clients cannot rely on versioned response contracts or generated types. | Define DTOs, error envelopes, API versioning policy, and schema tests. Generate client types if a frontend framework is introduced. |
| P2 | UX / Product | `public/app.js` | Only one fixture exists; there is no detail view, following, adaptive polling, source attribution UI, or explicit unavailable-provider state. | The MVP workflow is not yet validated for real users or real match volume. | Build against stored projections, add match detail/follow flows, and expose provider attribution/freshness consistently. |

### P0/P1 Refactoring Patterns

**Current request path**

```text
GET /api/matches
  -> createApiHandler
  -> provider.listMatches()
  -> normalize only inside provider implementation
  -> response
```

This path makes every browser request a potential upstream request and has no shared state.

**Target request path**

```text
Provider adapter
  -> timeout/retry/circuit breaker
  -> schema validation
  -> canonical identity + normalization
  -> transactional repository upsert
  -> current projection + snapshot

GET /api/matches
  -> MatchQueryService
  -> cache (short TTL)
  -> repository current projection
  -> typed DTO + freshness metadata
```

**Target provider factory guard**

```ts
function createProvider(definition: ProviderDefinition, config: Config): CricketProvider {
  if (!definition.enabled || !definition.approval.approved) {
    throw new ConfigurationError(`Provider ${definition.id} is not approved`);
  }
  if (!definition.approval.redistributionAllowed || !definition.approval.termsUrl) {
    throw new ConfigurationError(`Provider ${definition.id} lacks redistribution evidence`);
  }
  if (config.environment === "production" && definition.id === "fixture") {
    throw new ConfigurationError("Fixture provider cannot run in production");
  }
  return buildProviderAdapter(definition, config);
}
```

**Target safe browser rendering**

```js
const teamName = document.createElement("span");
teamName.textContent = team.name;
teamName.className = "team-name";
team.append(teamCode, teamName);
```

If a templating library is introduced later, its escaping behavior must be tested at the provider-to-browser boundary rather than assumed.

## 4. Optimization & Enhancement Recommendations

### Performance & Scalability

- Move provider polling to a single server-side worker. Poll live matches on an adaptive schedule, slow upcoming/completed matches, pause or reconcile completed matches, and never poll independently per browser tab.
- Use PostgreSQL as the source of truth for the current normalized projection and score snapshots. Add a short-lived Redis cache only after measuring read load or when multiple API instances require shared cache/locks.
- Deduplicate polling by canonical match ID and provider ID. Use an idempotency key such as `(provider_id, provider_match_id, source_updated_at)` where the provider supplies a monotonic update marker.
- Bound provider concurrency per source and honor quota windows. A single slow provider must not consume all worker capacity.
- Cache static assets with immutable fingerprints when the frontend is bundled. The current raw files are adequate for development but have no compression, cache policy, or build pipeline.
- Add database indexes for live status/start time, competition/date, provider mappings, and latest snapshot lookup. Verify with `EXPLAIN` after real query shapes exist.
- Keep API responses bounded with pagination or a server-defined maximum match count. Do not return raw payloads or unbounded ball-by-ball history from a list route.
- Add conditional requests (`ETag` or a version token) only after the projection API is stable; live data should not be cached by browsers beyond the intended freshness policy.

### Developer Experience (DX) & Tooling

- Add ESLint and a formatter with a checked configuration; run typecheck, lint, and tests in one `npm run verify` command.
- Keep `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; remove `any` from test helpers by defining a typed JSON response union.
- Add a schema validation dependency at the external boundary, then commit representative approved-provider payload fixtures with terms-compliant retention.
- Add a migration tool and a disposable local PostgreSQL/Redis profile only when persistence is introduced. Keep fixture-only development available for contributors who do not need infrastructure.
- Add GitHub Actions for install with lockfile enforcement, typecheck, lint, tests, coverage, dependency audit, and a smoke-start/health check.
- Add a `CONTRIBUTING.md` with provider approval workflow, fixture update rules, commands, environment variables, and test policy.
- Add contract versioning for API DTOs before a mobile or external client is built.
- Use a deterministic fake clock and fake provider in all time/rate-limit tests; never make CI call a public API.

### Security & Hardening Quick-Wins

- Remove `Access-Control-Allow-Origin: *` from production; use same-origin deployment or a strict origin allowlist.
- Replace `innerHTML` rendering with safe DOM construction or escaped templates. Add a CSP that disallows inline script and restricts connections to the API/provider domains required by the deployment.
- Validate all provider responses before normalization. Treat invalid data as a provider incident, not as a partially valid match.
- Set security headers, request timeouts, maximum URL/header/body sizes, and a rate limit at the edge.
- Keep provider keys server-side, use an environment schema, fail startup on missing production secrets, and redact secrets from logs.
- Replace the hardcoded `liveProviderEnabled: false` with computed registry/health state so readiness is truthful.
- Review provider terms as an operational control: record terms URL, review date, attribution, caching/retention rules, and a disable switch.
- Add dependency scanning and lockfile review to CI. Pin runtime/deployment images when containerization is adopted.

## 5. Future Engineering & Feature Roadmap

### Phase 1: Stabilization & Hardening (Short-Term: Weeks 1–4)

**Objectives:** make the current prototype safe to extend and establish a real data-source gate.

1. Complete the provider decision record and verify at least one legally reusable free source. If none qualifies, keep a clearly labelled fixture/demo mode and do not market live coverage.
2. Split `src/api/server.ts` into router, application service, DTO mapper, and static asset concerns.
3. Add schema validation for provider payloads and strict numeric/date/team-reference invariants in `normalizeMatch`.
4. Remove browser `innerHTML` interpolation, add CSP/security headers, origin allowlisting, and API rate limiting.
5. Add provider timeout, retry, backoff, circuit state, and typed error categories behind the provider port.
6. Add structured logs, request IDs, metrics, `/health/live`, and `/health/ready`.
7. Add CI with typecheck, lint, tests, coverage, dependency audit, and startup smoke test.
8. Add API contract tests for malformed payloads, invalid dates, provider failures, stale fallback, and response headers.

**Exit criteria:** no known XSS path, no production fixture provider, a verified legal source or explicit unavailable state, repeatable CI, and observable failure modes.

### Phase 2: Architectural Scaling & Performance (Medium-Term: Month 2–3)

**Objectives:** decouple client reads from provider availability and support multiple live matches safely.

1. Introduce PostgreSQL migrations and repositories for canonical entities, provider mappings, current match projections, score snapshots, provider health, and followed matches.
2. Build a server-side ingestion worker with adaptive polling, bounded concurrency, idempotent upserts, stale-cache fallback, and per-provider quotas.
3. Add a short-lived distributed cache only if measured load justifies it; use locks to prevent duplicate refresh work.
4. Add a second provider only after the first adapter passes the shared contract suite and the legal approval record is complete.
5. Add canonical match reconciliation across providers using explicit provider mapping and confidence/review states.
6. Add API pagination, stable DTOs, ETags/version tokens, and a match detail endpoint backed by projections.
7. Add browser E2E and accessibility coverage for live, delayed, stale, unavailable, completed, and provider-error states.
8. Load-test the polling worker and read API with realistic match counts and update frequencies.

**Exit criteria:** API traffic no longer multiplies provider calls, restarts do not lose current scores, two providers can be independently disabled, and SLOs are measurable.

### Phase 3: Next-Generation Feature Expansion (Long-Term: Month 4–6+)

| Feature Name | Business / Technical Value | Complexity | Architectural Prerequisites |
|---|---|---:|---|
| Followed matches and cross-device sync | Converts anonymous browsing into repeat usage while preserving a focused product. | Med | Durable users/devices, `followed_matches` table, authentication decision, notification preference model. |
| Match detail and innings timeline | Provides the core depth users expect without requiring full commentary rights. | Med | Snapshot/event model, provider coverage for innings detail, read-optimized match projection, API DTO versioning. |
| Ball-by-ball view | High engagement for cricket users when legally licensed and operationally affordable. | High | Licensed ball-by-ball rights, append-only event storage, ordering/idempotency rules, retention and high-volume query strategy. |
| Score update notifications | Brings users back for wickets, innings breaks, and results. | Med | Reliable freshness, event detection, user preferences, notification provider, opt-out and delivery observability. |
| Competition/team search and coverage directory | Makes broad cricket coverage discoverable and makes provider limitations transparent. | Low/Med | Canonical competition/team catalog, search indexes, coverage metadata, provider capability registry. |
| Provider health and data provenance page | Builds trust and gives operators a transparent support surface. | Low | Provider health metrics, attribution records, freshness history, operational status model. |
| Second sport vertical | Validates platform extensibility without forcing cricket into a generic lowest-common-denominator model. | High | Stable sport-neutral application ports, separate sport-specific domain model, provider contract suite, product UX rules per sport. |
| Historical analytics and trend views | Differentiates the product after live score reliability is established. | High | Licensed historical retention, analytical storage/read model, aggregation jobs, privacy and cost controls. |

**Phase 3 guardrail:** do not add betting, odds, predictions, or scraped commentary as shortcuts to engagement. Those features materially change legal, data, and operational risk and are outside the current product contract.

## 6. Technical Decision Log (ADR Recommendations)

The following ADRs should be formally decided before scaling beyond the fixture-backed prototype.

### ADR-001: Approved Live Data Provider and Rights Model

- **Decision required:** Which source is authorized for live cricket scores, under what free-tier and redistribution terms, with what attribution, coverage, caching, and retention limits?
- **Options:** one approved third-party API; an official competition/board feed; fixture/manual mode until approval; multiple approved providers for coverage/resilience.
- **Recommendation:** Start with one approved provider and a non-production fixture mode. Add a second provider only for a demonstrated coverage or availability gap.
- **Consequence:** The provider registry becomes an enforceable configuration and compliance boundary, not documentation only.

### ADR-002: Ingestion and Read Architecture

- **Decision required:** Should the system poll providers in a server-side worker and serve persisted projections, or let API requests fetch upstream data?
- **Options:** request-time fetch; in-process scheduler; durable queue/worker; managed scheduled jobs.
- **Recommendation:** Use a server-side ingestion worker with bounded concurrency and a PostgreSQL current projection. Introduce a queue when provider count or update volume requires independent retries and horizontal workers.
- **Consequence:** More infrastructure, but stable reads, quota protection, stale fallback, and reproducible snapshots.

### ADR-003: Persistence and Cache Strategy

- **Decision required:** What is the source of truth for current scores and historical observations, and when is a cache justified?
- **Options:** memory only; PostgreSQL only; PostgreSQL plus Redis; event store plus analytical database.
- **Recommendation:** PostgreSQL first for canonical entities, projections, and bounded snapshots. Add Redis for short TTL reads/distributed locks only after measured need. Avoid event-sourcing the MVP.
- **Consequence:** Durable state and transaction guarantees without prematurely introducing a distributed data model.

### ADR-004: API Contract and Client Delivery Model

- **Decision required:** Should the product remain a server-served browser app, adopt a frontend framework, or expose a versioned public API for clients?
- **Options:** native browser JavaScript; React/Vite or similar; server-rendered pages; versioned REST API plus web client.
- **Recommendation:** Stabilize a versioned REST/JSON contract and keep the current lightweight client until match detail/follow workflows justify a framework. Generate or share DTO types only after the contract is versioned.
- **Consequence:** Preserves current simplicity while preventing provider/domain types from becoming an accidental public API.
