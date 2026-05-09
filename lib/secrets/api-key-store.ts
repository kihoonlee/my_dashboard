// 사용자가 입력한 API 키 (Anthropic / OpenAI / GitHub) 저장·조회·삭제.
// pgcrypto pgp_sym_encrypt + base64 (oauth_tokens와 동일 암호화 방식).
// OAUTH_TOKEN_KEY 환경변수 재사용 — 키 변경 시 기존 행 복호화 불가.
//
// maskedTail은 마지막 4자만. UI에서 "•••• 평문tail" 표시용. 평문 노출 안전.

import "server-only";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";

export type ApiKeyProvider = "anthropic" | "openai" | "github" | "gemini";

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  "anthropic",
  "openai",
  "github",
  "gemini",
];

function getKey(): string {
  const key = process.env.OAUTH_TOKEN_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "OAUTH_TOKEN_KEY is missing or too short. Set it in .env.local (>= 32 bytes recommended).",
    );
  }
  return key;
}

export function maskTail(value: string): string {
  const trimmed = value.trim();
  return trimmed.slice(-4);
}

export async function saveApiKey(params: {
  userId: string;
  provider: ApiKeyProvider;
  value: string;
  verifiedAt?: Date | null;
}): Promise<void> {
  const { userId, provider, value, verifiedAt } = params;
  const key = getKey();
  const tail = maskTail(value);

  await db.execute(sql`
    INSERT INTO api_keys (
      user_id, provider, encrypted_value, masked_tail,
      verified_at, created_at, updated_at
    ) VALUES (
      ${userId},
      ${provider},
      encode(pgp_sym_encrypt(${value}, ${key}), 'base64'),
      ${tail},
      ${tsTz(verifiedAt ?? null)},
      now(),
      now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE SET
      encrypted_value = EXCLUDED.encrypted_value,
      masked_tail = EXCLUDED.masked_tail,
      verified_at = EXCLUDED.verified_at,
      updated_at = now()
  `);
}

export async function loadApiKey(params: {
  userId: string;
  provider: ApiKeyProvider;
}): Promise<{
  value: string;
  maskedTail: string;
  verifiedAt: Date | null;
} | null> {
  const { userId, provider } = params;
  const key = getKey();

  const rows = await db.execute<{
    value: string;
    masked_tail: string;
    verified_at: Date | null;
  }>(sql`
    SELECT
      pgp_sym_decrypt(decode(encrypted_value, 'base64'), ${key}) AS value,
      masked_tail,
      verified_at
    FROM api_keys
    WHERE user_id = ${userId} AND provider = ${provider}
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    value: row.value,
    maskedTail: row.masked_tail,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
  };
}

export async function deleteApiKey(params: {
  userId: string;
  provider: ApiKeyProvider;
}): Promise<void> {
  await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, params.userId),
        eq(apiKeys.provider, params.provider),
      ),
    );
}

export type ApiKeyMeta = {
  provider: ApiKeyProvider;
  maskedTail: string;
  verifiedAt: Date | null;
  updatedAt: Date | null;
};

/** UI 메타용 — 평문은 안 내보냄. */
export async function listApiKeyMeta(userId: string): Promise<ApiKeyMeta[]> {
  const rows = await db
    .select({
      provider: apiKeys.provider,
      maskedTail: apiKeys.maskedTail,
      verifiedAt: apiKeys.verifiedAt,
      updatedAt: apiKeys.updatedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return rows
    .filter((r) => API_KEY_PROVIDERS.includes(r.provider as ApiKeyProvider))
    .map((r) => ({
      provider: r.provider as ApiKeyProvider,
      maskedTail: r.maskedTail,
      verifiedAt: r.verifiedAt,
      updatedAt: r.updatedAt,
    }));
}
