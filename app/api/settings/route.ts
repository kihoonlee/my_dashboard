// GET   /api/settings — 사용자 프로필 + 외부 연동 상태 + 마지막 동기화 메타.
// PATCH /api/settings — name 필드만 갱신 (v2).
//
// `settings_json`에는 동기화 메타(lastCalendarSync)와 todayInsight 캐시가 들어있다.
// 통째로 노출하지 않고 UI에 필요한 부분만 형태 맞춰 반환.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthTokens, users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { envIsSet, readEnvWithFallback } from "@/lib/env/read";
import {
  API_KEY_PROVIDERS,
  listApiKeyMeta,
  type ApiKeyProvider,
} from "@/lib/secrets/api-key-store";

const PROVIDER_ENV: Record<ApiKeyProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  github: "GITHUB_PAT",
  gemini: "GEMINI_API_KEY",
};

type ApiKeyState =
  | { source: "db"; maskedTail: string; verifiedAt: string | null }
  | { source: "env" }
  | { source: "none" };

type SyncMeta = {
  at?: string;
  [key: string]: unknown;
};

type Preferences = Record<string, never>;

type StoredSettings = {
  lastCalendarSync?: SyncMeta;
  // v1 잔재 (obsidian/github/news/skills sync 메타) — DB에 남아있어도 응답에 안 내려보냄.
  todayInsight?: { date?: string; oneLiner?: string } & Record<string, unknown>;
  preferences?: Preferences;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      settings: users.settingsJson,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const settings = (u.settings ?? {}) as StoredSettings;

  // OAuth 연동 상태 — refresh token 메타만 (값 자체는 절대 안 내보냄)
  const tokenRows = await db
    .select({
      provider: oauthTokens.provider,
      scope: oauthTokens.scope,
      expiresAt: oauthTokens.expiresAt,
      lastRefreshedAt: oauthTokens.lastRefreshedAt,
      updatedAt: oauthTokens.updatedAt,
    })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId));

  // API 키 — DB 우선, env fallback. 평문은 절대 안 내보냄.
  const dbKeys = await listApiKeyMeta(userId);
  const dbKeyByProvider = new Map(dbKeys.map((k) => [k.provider, k]));
  const apiKeyStates = {} as Record<ApiKeyProvider, ApiKeyState>;
  for (const provider of API_KEY_PROVIDERS) {
    const dbRow = dbKeyByProvider.get(provider);
    if (dbRow) {
      apiKeyStates[provider] = {
        source: "db",
        maskedTail: dbRow.maskedTail,
        verifiedAt: dbRow.verifiedAt
          ? dbRow.verifiedAt.toISOString()
          : null,
      };
    } else if (envIsSet(PROVIDER_ENV[provider])) {
      apiKeyStates[provider] = { source: "env" };
    } else {
      apiKeyStates[provider] = { source: "none" };
    }
  }

  return NextResponse.json({
    profile: {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
    },
    integrations: {
      apiKeys: apiKeyStates,
      allowedEmail: readEnvWithFallback("ALLOWED_EMAIL") ?? null,
      oauthTokens: tokenRows.map((t) => ({
        provider: t.provider,
        scope: t.scope,
        expiresAt: t.expiresAt,
        lastRefreshedAt: t.lastRefreshedAt,
        updatedAt: t.updatedAt,
      })),
    },
    sync: {
      calendar: settings.lastCalendarSync ?? null,
    },
    todayInsight: settings.todayInsight
      ? {
          date: settings.todayInsight.date ?? null,
          oneLiner:
            typeof settings.todayInsight.oneLiner === "string"
              ? settings.todayInsight.oneLiner
              : null,
        }
      : null,
    preferences: settings.preferences ?? {},
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: { name?: string | null } = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    update.name = trimmed.length > 0 ? trimmed.slice(0, 80) : null;
  } else if (body.name === null) {
    update.name = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  await db.update(users).set(update).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
