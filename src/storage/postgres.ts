import { Pool } from "pg";
import { PostgresMatchRepository } from "./postgres-match-repository.js";

export function createPostgresMatchRepository(connectionString: string): PostgresMatchRepository {
  return new PostgresMatchRepository(new Pool({ connectionString, max: 10 }));
}