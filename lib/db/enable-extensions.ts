import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    console.log("Enabling pgvector extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("  ✓ vector");

    console.log("Enabling pgcrypto (for token encryption later)...");
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    console.log("  ✓ pgcrypto");

    console.log("Enabling pg_trgm (for Korean text search assist)...");
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    console.log("  ✓ pg_trgm");

    console.log("Done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
