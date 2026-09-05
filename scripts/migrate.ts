import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const pool = new Pool({ connectionString });
try {
  const migration = await readFile(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");
  await pool.query(migration);
  console.log("Applied migration 001_initial");
} finally {
  await pool.end();
}