// POST /api/sync/github
// FlowTo-ai 조직(또는 ?org= 지정)의 repo 목록 + 최근 활동을 동기화.
// products / github_activity 테이블 업데이트. users.settings_json.lastGithubSync 기록.

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { syncGithubOrg } from "@/lib/github/sync";

const DEFAULT_ORG = "FlowTo-ai";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") ?? DEFAULT_ORG;

  let summary;
  try {
    summary = await syncGithubOrg(org);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 500 },
    );
  }

  // settings_json에 마지막 sync 시각·지표 기록 (UI 헤더에서 사용)
  try {
    const userId = await ensureUser(user);
    const summaryForJson = {
      at: new Date().toISOString(),
      org: summary.org,
      repos: summary.repos,
      activeRepos: summary.activeRepos,
      staleRepos: summary.staleRepos,
      archivedRepos: summary.archivedRepos,
      newActivities: summary.newActivities,
      llmCalls: summary.llmCalls,
      totalCostUsd: summary.totalCostUsd,
      errors: summary.errors.slice(0, 5),
    };
    await db
      .update(users)
      .set({
        settingsJson: sql`
          COALESCE(${users.settingsJson}, '{}'::jsonb)
          || jsonb_build_object('lastGithubSync', ${JSON.stringify(summaryForJson)}::jsonb)
        `,
      })
      .where(eq(users.id, userId));
  } catch (e) {
    console.error("[sync/github] settings update failed:", e);
  }

  return NextResponse.json({ ok: true, ...summary });
}
