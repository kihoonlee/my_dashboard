// .env.local 직접 파싱 fallback.
// 부모 셸이 빈 값(KEY="")으로 export 하면 Next.js의 dotenv가 override:false 정책 때문에
// .env.local 값을 적용하지 않는다 (Claude Code harness 등). lib/anthropic/client.ts와
// lib/openai/embeddings.ts에 흩어져 있던 같은 패턴을 공유 헬퍼로 모은 것.

import "server-only";
import { readFileSync } from "fs";
import { resolve } from "path";

let cache: Map<string, string> | null = null;

function loadEnvFile(): Map<string, string> {
  if (cache) return cache;
  const m = new Map<string, string>();
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // surrounding quotes 제거 (dotenv 표준)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      m.set(key, value);
    }
  } catch {
    // .env.local 없음 — 빈 map 반환
  }
  cache = m;
  return m;
}

/**
 * `process.env[name]`을 우선 시도, 비어있으면 `.env.local` 파일 직접 파싱.
 * 둘 다 없으면 undefined.
 */
export function readEnvWithFallback(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess && fromProcess.length > 0) return fromProcess;
  const fromFile = loadEnvFile().get(name)?.trim();
  return fromFile && fromFile.length > 0 ? fromFile : undefined;
}

/** boolean 형태 — 값이 비어있지 않으면 true. */
export function envIsSet(name: string): boolean {
  return readEnvWithFallback(name) !== undefined;
}
