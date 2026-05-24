import { config as loadDotenv } from "dotenv";
// Always load .env.local — Next.js prod runtime이 launchd 등 sandboxed env에서
// .env.local을 못 읽는 케이스가 있어 명시 로드한다. dotenv는 기본 override:false
// 이므로 process.env에 이미 값이 있으면(plist EnvironmentVariables 등) 안 덮어쓴다.
// 또한 tsx 직접 실행 스크립트(seed.ts / enable-extensions.ts)도 같은 경로로 동작.
loadDotenv({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// 진단: 비밀번호 가린 형태로 host:port 노출. Next.js prod가 multiple workers로
// 같은 module을 여러 번 init하는 케이스에서도 한 번만 출력하도록 globalThis 가드.
declare global {
  // eslint-disable-next-line no-var
  var __myhub_db_logged: boolean | undefined;
}
if (process.env.NODE_ENV !== "test" && !globalThis.__myhub_db_logged) {
  globalThis.__myhub_db_logged = true;
  const masked = connectionString.replace(/\/\/[^@]+@/, "//***@");
  console.warn("[db] connecting to", masked);
}

const queryClient = postgres(connectionString, {
  prepare: false,
  max: 10,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
