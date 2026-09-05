# Cricket Score

An extensible live-sports score tracker, starting with cricket. The product should let a user find matches, follow live scores, and understand match state without needing to visit several score pages.

## Product Goal

Build a reliable cricket MVP that:

- shows currently live and recently completed cricket matches;
- provides score, innings, wickets, overs, run rate, result, and match status;
- supports international, domestic, franchise, and women's matches when the licensed data source covers them;
- refreshes live data without making excessive requests;
- makes the source and freshness of every score clear; and
- can add other sports later without rewriting the cricket domain model.

The first release is a score-following product, not a streaming, betting, prediction, or news product.

## Implementation Status

Phase 2 is in progress. The repository currently has typed cricket contracts, a compliance-gated provider registry, runtime provider-payload validation, fixture and neutral HTTP provider adapters, retrying repository-backed ingestion with guarded polling, an in-memory repository plus PostgreSQL migration/repository support, an HTTP API with readiness/security headers, server-derived freshness states, a safe responsive dashboard, and offline/integration tests. No production live-score provider is enabled.

## Non-negotiable Data and Legal Policy

Only use data sources that are free to use **and** legally authorized for this product. “Publicly visible” does not automatically mean “licensed for API reuse.”

Before integrating a provider, record:

- the provider name, API documentation URL, and terms of service;
- whether commercial use is allowed or requires separate permission;
- the free-tier limits, attribution requirements, caching rules, and retention rules;
- the competitions and fields covered;
- the provider's uptime/contact details; and
- the date on which the terms were reviewed.

Do not scrape Cricbuzz, ESPNcricinfo, Google result pages, broadcaster sites, or other websites unless their terms explicitly grant permission. Do not bypass authentication, rate limits, robots rules, paywalls, or technical controls.

Potential sources must be treated as candidates until their current terms are verified:

- a cricket API with a documented free plan and explicit redistribution rights;
- an official competition, board, or league API/feed that grants reuse rights;
- Cricsheet for historical/open cricket data and development fixtures, not assumed live coverage;
- a self-hosted/manual feed for development and demos, clearly labelled as non-production data.

The provider registry in the application should prevent an unverified source from being enabled in production. If no qualifying free live provider is available for a competition, show “live data unavailable” rather than silently scraping or presenting stale data as live.

## MVP Scope

### Included

1. A responsive match list with Live, Upcoming, and Completed sections.
2. Search and filtering by team, competition, format, date, and match status.
3. A match detail page with teams, venue, scheduled time, toss, innings totals, wickets, overs, run rate, target, result, and last update time.
4. Match following/favorites stored locally first, with an account-ready boundary.
5. Automatic polling with adaptive intervals, manual refresh, stale-data warnings, and a visible provider attribution.
6. A normalized internal model that can merge provider responses without exposing provider-specific fields to the UI.
7. Basic observability: request failures, rate-limit responses, provider freshness, normalization failures, and sync duration.
8. Tests using recorded fixtures and mock provider responses. No test should call a live provider by default.

### Explicitly out of scope for MVP

- video, audio, or live broadcast rights;
- betting, odds, gambling, or wagering features;
- predictions, fantasy scoring, or editorial news;
- user chat and social moderation;
- full ball-by-ball commentary unless the selected provider licenses it;
- login, paid subscriptions, and push notifications;
- scraping as a fallback; and
- multi-sport UI before the cricket workflow is stable.

## Proposed Architecture

```text
Licensed provider APIs
	|
Provider adapters + rate-limit handling
	|
Validation, normalization, deduplication
	|
Cache/database + freshness metadata
	|
API layer
	|
Web client: match list -> match detail -> followed matches
```

### Core boundaries

- **Provider adapter:** translates one external API into the internal contract. It owns authentication, pagination, retries, quotas, and provider-specific quirks.
- **Provider registry:** stores legal approval, capabilities, limits, attribution, and enabled/disabled state.
- **Normalizer:** maps teams, venues, competitions, statuses, innings, and score values into stable internal types.
- **Match identity layer:** creates stable IDs and maps provider IDs to internal IDs. Never use a display name as the only identity.
- **Freshness service:** records `fetchedAt`, `sourceUpdatedAt` when available, polling state, and stale thresholds.
- **Cache/storage:** reduces provider traffic and keeps the UI usable during brief upstream failures.
- **Public API:** exposes product-shaped data, not raw provider payloads or secrets.
- **Web client:** renders consistent states for loading, live, delayed, stale, unavailable, completed, and provider error.

Recommended initial implementation: a TypeScript web application with a small server-side integration layer, a relational database for normalized match data, and a cache for short-lived live responses. The exact framework can be chosen during setup after checking the container and deployment target.

## Internal Data Model

Design the cricket model so a future sport can implement the same high-level interfaces while retaining sport-specific detail.

Core entities:

- `Sport`: starts with `cricket`.
- `Competition`: name, country/region, season, format, provider mappings.
- `Team`: canonical name, short name, logo policy, provider mappings.
- `Venue`: name, city, country, timezone.
- `Match`: sport, competition, teams, venue, start time, status, format, provider IDs, canonical identity.
- `Innings`: batting team, runs, wickets, overs, balls, target, declared/all-out state.
- `ScoreSnapshot`: match, innings values, status, source, fetched time, source update time.
- `ProviderHealth`: latency, failures, quota state, last successful fetch.
- `FollowedMatch`: user/device relation to a match.

Keep raw provider payloads out of the client contract. They may be retained temporarily for debugging only when the provider's terms permit it.

## Roadmap

### Phase 0: Discovery and compliance, 1-2 days

- Confirm target users and first deployment environment.
- Inventory candidate free providers and verify current terms directly.
- Create the provider registry and a one-page data-source decision record.
- Define required fields and acceptable freshness for live match cards.
- Choose one provider with sufficient coverage, or document a development fixture strategy until one is approved.

**Exit criteria:** one approved source or an explicit, tested “no live source configured” mode; no implementation depends on scraping.

### Phase 1: Foundation, 2-4 days

- Initialize the application, formatting, linting, type checking, and test runner.
- Define domain types, status enums, error types, and provider interfaces.
- Add environment configuration and secret handling.
- Add migrations/schema for competitions, teams, venues, matches, snapshots, and provider health.
- Add mock provider fixtures and contract tests.

**Exit criteria:** the application builds, tests run offline, and a fixture can be normalized into the internal model.

### Phase 2: First live provider, 3-5 days

- Implement the approved provider adapter.
- Add timeouts, bounded retries, exponential backoff, quota handling, and structured logs.
- Normalize IDs, teams, statuses, innings, and timestamps.
- Add deduplication and deterministic match identity rules.
- Cache responses according to provider terms and expose source/freshness metadata.

**Exit criteria:** live requests work in a controlled environment, failures are visible, and the provider can be disabled without breaking the rest of the application.

### Phase 3: Cricket MVP interface, 3-5 days

- Build the match list with status filters and search.
- Build the match detail view and responsive states.
- Add follow/unfollow using local storage or an anonymous device ID.
- Add adaptive polling: more frequent for active matches, slower for upcoming/completed matches, paused when the page is hidden.
- Add stale, delayed, unavailable, and completed messaging.

**Exit criteria:** a user can find a match, open it, follow it, see a score update, and understand how fresh that score is on mobile and desktop.

### Phase 4: Reliability and release hardening, 2-4 days

- Add integration tests for provider failures, malformed payloads, duplicates, timezones, abandoned matches, super overs, ties, and rain-affected matches.
- Add rate-limit dashboards/alerts and a provider health endpoint.
- Run accessibility checks, security review, dependency audit, and load tests for polling behavior.
- Add a public data-source/attribution page and an operational runbook.
- Deploy a staging environment, then production with feature flags.

**Exit criteria:** known failure states have intentional UI, no secrets reach the client, and production can be operated without violating provider terms.

### Phase 5: Post-MVP expansion

- Add a second legally approved cricket provider only if it improves coverage or resilience.
- Add ball-by-ball data only when licensed and useful for the product.
- Add accounts and cross-device followed matches.
- Add notifications only after notification permissions, opt-out, and provider freshness are reliable.
- Introduce a `SportAdapter` boundary and add the next sport as a separate vertical slice, not as generic UI abstractions prematurely.

## Freshness and Polling Policy

The product must distinguish these states:

- **Live:** recent successful update within the configured live threshold.
- **Delayed:** provider says data is delayed or the update is older than the live threshold but below the stale threshold.
- **Stale:** no successful update within the stale threshold.
- **Unavailable:** provider has no coverage or the integration is disabled.
- **Completed:** final result is known; stop live polling except for reconciliation.

Never promise “real time” unless the provider contract supports that claim. Display the last successful update and use server-side polling where possible so many clients do not multiply provider requests.

## Security, Privacy, and Operations

- Keep API keys server-side and load them from environment/secrets management.
- Validate all external payloads at the adapter boundary.
- Apply request timeouts, response-size limits, and bounded retries.
- Cache only what the provider permits.
- Avoid collecting personal data for the anonymous MVP.
- Add correlation IDs and redact credentials from logs.
- Monitor provider quota, latency, errors, freshness, and normalization failures.
- Provide a kill switch per provider and a maintenance state for the UI.

## Definition of Done for MVP

- A legally approved, documented free source supplies at least one target competition.
- A user can see live, upcoming, and completed matches.
- A match detail page shows normalized score and explicit freshness/source information.
- Provider errors and stale data are clearly represented rather than hidden.
- The app works with offline fixtures and has no default scraping path.
- Unit, integration, accessibility, and basic end-to-end checks pass.
- Deployment, attribution, data retention, and provider shutdown procedures are documented.

## Immediate Next Steps

1. Decide the first target competitions and whether the initial release is web-only.
2. Verify candidate providers and fill in the provider decision record before writing an adapter.
3. Initialize the TypeScript application and test harness.
4. Implement the internal cricket types and fixture-backed normalizer.
5. Build the match list against fixtures, then connect the approved provider behind the same interface.
