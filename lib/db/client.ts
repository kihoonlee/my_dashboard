import { config as loadDotenv } from "dotenv";
// tsx로 직접 실행되는 스크립트(seed.ts / enable-extensions.ts 등)를 위해
// 모듈 import 시점에 dotenv를 먼저 로드한다. Next.js 런타임에서는 process.env가
// 이미 채워져 있어 영향 없음 (loadDotenv는 기존 값을 덮어쓰지 않음).
if (!process.env.DATABASE_URL) {
  loadDotenv({ path: ".env.local" });
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const queryClient = postgres(connectionString, {
  prepare: false,
  max: 10,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
