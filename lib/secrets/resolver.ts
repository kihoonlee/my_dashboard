// API 키 해소(resolve) 우선순위: DB-saved → process.env → .env.local fallback.
// 단일 사용자 가정 — ALLOWED_EMAIL로 user 조회 (lib/cron/auth.ts:getCronUserId 패턴).
//
// 60초 in-memory 캐시 — provider별. 저장/삭제 라우트는 invalidateApiKeyCache(provider)
// 호출해 즉시 갱신. SDK 클라이언트 인스턴스는 캐시 안 함 (key 회전 즉시 반영).

import "server-only";
import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { readEnvWithFallback } from "@/lib/env/read";
import {
  loadApiKey,
  type ApiKeyProvider,
} from "@/lib/secrets/api-key-store";

const TTL_MS = 60_000;

type CacheEntry = {
  value: string | null;
  expiresAt: number;
};

const cache = new Map<ApiKeyProvider, CacheEntry>();

const ENV_VAR: Record<ApiKeyProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  github: "GITHUB_PAT",
};

let cachedUserId: string | null | undefined;

async function getResolverUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  const email = process.env.ALLOWED_EMAIL?.trim();
  if (!email) {
    cachedUserId = null;
    return null;
  }
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  cachedUserId = u?.id ?? null;
  return cachedUserId;
}

function tryGhCli(): string | null {
  try {
    const out = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * 우선순위:
 *   1) `api_keys` 테이블의 (ALLOWED_EMAIL user, provider) 행 (있고 ALLOWED_EMAIL이 박혀있으면)
 *   2) `process.env[ENV]` 또는 `.env.local`의 ENV 값
 *   3) provider==="github"이면 `gh auth token` CLI fallback
 */
export async function resolveApiKey(
  provider: ApiKeyProvider,
): Promise<string | null> {
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: string | null = null;

  const userId = await getResolverUserId();
  if (userId) {
    try {
      const row = await loadApiKey({ userId, provider });
      if (row?.value && row.value.length > 0) {
        value = row.value;
      }
    } catch (e) {
      // OAUTH_TOKEN_KEY 누락 등 — 조용히 fallback
      console.warn(`[secrets/resolver] DB lookup failed for ${provider}:`, e);
    }
  }

  if (!value) {
    const fromEnv = readEnvWithFallback(ENV_VAR[provider]);
    if (fromEnv) value = fromEnv;
  }

  if (!value && provider === "github") {
    value = tryGhCli();
  }

  cache.set(provider, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function invalidateApiKeyCache(provider?: ApiKeyProvider): void {
  if (provider) {
    cache.delete(provider);
  } else {
    cache.clear();
  }
}

/** UI 표시용 — DB에 row가 있는지 boolean. resolveApiKey와 다른 시그니처. */
export async function hasDbApiKey(provider: ApiKeyProvider): Promise<boolean> {
  const userId = await getResolverUserId();
  if (!userId) return false;
  try {
    const row = await loadApiKey({ userId, provider });
    return !!row?.value;
  } catch {
    return false;
  }
}
