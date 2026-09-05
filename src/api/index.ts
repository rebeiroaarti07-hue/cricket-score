import { FixtureProvider } from "../providers/fixture-provider.js";
import { RepositoryProvider } from "../providers/repository-provider.js";
import { IngestionCoordinator } from "../application/ingestion.js";
import { InMemoryMatchRepository } from "../storage/match-repository.js";
import { createPostgresMatchRepository } from "../storage/postgres.js";
import type { MatchRepository } from "../storage/match-repository.js";
import { createApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const provider = new FixtureProvider();
const repository: MatchRepository = process.env.DATABASE_URL
  ? createPostgresMatchRepository(process.env.DATABASE_URL)
  : new InMemoryMatchRepository();
const ingestion = new IngestionCoordinator(provider, repository);

await ingestion.refresh();
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60000);
ingestion.startPolling(pollIntervalMs, (error) => {
  console.error("Provider refresh failed", error);
});
const server = createApiServer(new RepositoryProvider(repository));

server.listen(port, () => {
  const storage = process.env.DATABASE_URL ? "postgres" : "memory";
  console.log(`Cricket Score API listening on http://localhost:${port} (${storage} storage)`);
});