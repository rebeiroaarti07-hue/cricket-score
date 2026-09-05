# Data Source Decision Record

Status: `pending`

No production live-score provider has been approved yet.

## Acceptance checklist

- [ ] Provider API documentation reviewed
- [ ] Terms of service reviewed
- [ ] Free-tier request limits recorded
- [ ] Commercial use position recorded
- [ ] Redistribution and caching rights confirmed
- [ ] Required attribution recorded
- [ ] Competition and field coverage tested
- [ ] Contact/support path recorded
- [ ] Review date recorded

Until every item is complete, the provider must not be enabled for production. The application currently uses only a local fixture for development and automated tests.

## Implementation status

The repository now contains a neutral HTTP provider adapter in `src/providers/http-provider.ts`. It is intentionally not registered or enabled because no specific provider has passed this checklist. Once a provider is approved, its documented response must be adapted to the `{ data: [...] }` / `{ data: {...} }` envelope and tested with terms-compliant fixtures.