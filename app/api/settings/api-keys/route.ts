// POST   /api/settings/api-keys — provider별 키 검증 + pgcrypto 암호화 저장.
// DELETE /api/settings/api-keys?provider=... — DB row 삭제 (env fallback으로 회귀).
//
// 저장은 검증 통과 후만. settings_json.apiKeys.<provider>에 메타(savedAt/verifiedAt/maskedTail)
// 함께 기록 — UI가 빠르게 표시할 수 있도록.

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import {
  API_KEY_PROVIDERS,
  deleteApiKey,
  maskTail,
  saveApiKey,
  type ApiKeyProvider,
} from "@/lib/secrets/api-key-store";
import { invalidateApiKeyCache } from "@/lib/secrets/resolver";
import { validateApiKey } from "@/lib/secrets/validators";

function isValidProvider(v: unknown): v is ApiKeyProvider {
  return (
    typeof v === "string" &&
    (API_KEY_PROVIDERS as readonly string[]).includes(v)
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  let body: { provider?: unknown; apiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidProvider(body.provider)) {
    return NextResponse.json(
      { error: "invalid_provider", message: "provider는 anthropic|openai|github 중 하나여야 합니다" },
      { status: 400 },
    );
  }
  const provider = body.provider;

  if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 8) {
    return NextResponse.json(
      { error: "invalid_key", message: "키가 비어있거나 너무 짧습니다" },
      { status: 400 },
    );
  }
  const apiKey = body.apiKey.trim();

  const result = await validateApiKey(provider, apiKey);
  if (!result.ok) {
    return NextResponse.json(
      { error: "validation_failed", message: result.error },
      { status: 400 },
    );
  }

  const verifiedAt = new Date();
  const tail = maskTail(apiKey);

  try {
    await saveApiKey({ userId, provider, value: apiKey, verifiedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "save_failed", message: msg },
      { status: 500 },
    );
  }

  // settings_json.apiKeys.<provider> = { savedAt, verifiedAt, maskedTail }
  // 다른 provider 메타와 다른 settings 키들 모두 보존되도록 deep merge.
  const meta = {
    savedAt: verifiedAt.toISOString(),
    verifiedAt: verifiedAt.toISOString(),
    maskedTail: tail,
  };
  const inner = JSON.stringify({ [provider]: meta });
  await db
    .update(users)
    .set({
      settingsJson: sql`
        COALESCE(${users.settingsJson}, '{}'::jsonb)
        || jsonb_build_object(
             'apiKeys',
             COALESCE(${users.settingsJson}->'apiKeys', '{}'::jsonb)
             || ${inner}::jsonb
           )
      `,
    })
    .where(eq(users.id, userId));

  invalidateApiKeyCache(provider);

  return NextResponse.json({
    ok: true,
    provider,
    verifiedAt: verifiedAt.toISOString(),
    maskedTail: tail,
    detail: result.detail,
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const { searchParams } = new URL(request.url);
  const providerRaw = searchParams.get("provider");
  if (!isValidProvider(providerRaw)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  const provider = providerRaw;

  await deleteApiKey({ userId, provider });

  // settings_json.apiKeys.<provider> 키 제거 (남은 형제는 보존).
  await db
    .update(users)
    .set({
      settingsJson: sql`
        COALESCE(${users.settingsJson}, '{}'::jsonb)
        || jsonb_build_object(
             'apiKeys',
             COALESCE(${users.settingsJson}->'apiKeys', '{}'::jsonb) - ${provider}
           )
      `,
    })
    .where(eq(users.id, userId));

  invalidateApiKeyCache(provider);
  return NextResponse.json({ ok: true });
}
