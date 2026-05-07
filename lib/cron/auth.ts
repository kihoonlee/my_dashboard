// Vercel Cron 요청 인증.
// Vercel은 cron 호출 시 `Authorization: Bearer ${CRON_SECRET}` 헤더를 보낸다.
// 로컬 dev/수동 테스트 시: 같은 secret을 헤더로 보내거나 NODE_ENV=development면 우회.

import "server-only";
import type { NextRequest } from "next/server";

export type CronAuthResult = { ok: true } | { ok: false; reason: string };

export function verifyCronRequest(request: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET?.trim();

  // dev 환경에서 secret 미설정 시 통과 (로컬 수동 테스트 편의)
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CRON_SECRET not configured (production)" };
    }
    return { ok: true };
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return { ok: true };
  return { ok: false, reason: "invalid_or_missing_cron_secret" };
}

/**
 * cron 작업이 단일 사용자(MyHub은 본질적으로 1인용) 컨텍스트에서 돌아가야 할 때,
 * 사용자 ID를 어떻게 얻을지. 옵션:
 *   1) ALLOWED_EMAIL 으로 users.email lookup (간단, 1인 가정)
 *   2) CRON_USER_ID env 명시
 * 여기서는 (1) 사용. 다중 사용자 시점에 (2)로 전환.
 */
export async function getCronUserId(): Promise<string | null> {
  const email = process.env.ALLOWED_EMAIL?.trim();
  if (!email) return null;

  const { db } = await import("@/lib/db/client");
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u?.id ?? null;
}
