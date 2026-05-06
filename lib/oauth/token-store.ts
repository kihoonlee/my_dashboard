// OAuth refresh token 저장/조회.
// pgcrypto pgp_sym_encrypt로 column-level 암호화. 평문은 절대 DB에 들어가지 않는다.
// OAUTH_TOKEN_KEY 환경변수가 키 — 키 변경 시 기존 행은 복호화 불가 → 사용자 재로그인 필요.

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function getKey(): string {
  const key = process.env.OAUTH_TOKEN_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "OAUTH_TOKEN_KEY is missing or too short. Set it in .env.local (>= 32 bytes recommended).",
    );
  }
  return key;
}

export async function saveRefreshToken(params: {
  userId: string;
  provider: string;
  refreshToken: string;
  scope?: string;
  expiresAt?: Date | null;
}): Promise<void> {
  const { userId, provider, refreshToken, scope, expiresAt } = params;
  const key = getKey();

  await db.execute(sql`
    INSERT INTO oauth_tokens (
      user_id, provider, scope, encrypted_refresh_token,
      expires_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      ${userId},
      ${provider},
      ${scope ?? ""},
      encode(pgp_sym_encrypt(${refreshToken}, ${key}), 'base64'),
      ${expiresAt ?? null},
      now(),
      now(),
      now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE SET
      scope = EXCLUDED.scope,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      expires_at = EXCLUDED.expires_at,
      last_refreshed_at = now(),
      updated_at = now()
  `);
}

export async function loadRefreshToken(params: {
  userId: string;
  provider: string;
}): Promise<{ refreshToken: string; scope: string; expiresAt: Date | null } | null> {
  const { userId, provider } = params;
  const key = getKey();

  const rows = await db.execute<{
    refresh_token: string;
    scope: string;
    expires_at: Date | null;
  }>(sql`
    SELECT
      pgp_sym_decrypt(
        decode(encrypted_refresh_token, 'base64'),
        ${key}
      ) AS refresh_token,
      scope,
      expires_at
    FROM oauth_tokens
    WHERE user_id = ${userId} AND provider = ${provider}
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    refreshToken: row.refresh_token,
    scope: row.scope,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

export async function deleteRefreshToken(params: {
  userId: string;
  provider: string;
}): Promise<void> {
  await db
    .delete(oauthTokens)
    .where(
      and(
        eq(oauthTokens.userId, params.userId),
        eq(oauthTokens.provider, params.provider),
      ),
    );
}
