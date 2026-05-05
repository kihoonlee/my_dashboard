// 이 스크립트는 client.ts와 별개로 직접 postgres 연결을 만든다.
// tsx 직접 실행 시 .env.local 자동 로드가 필요하므로 dotenv를 명시적으로 호출.
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

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
