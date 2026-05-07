// POST /api/sync/obsidian
// 옵시디언 vault → DB 동기화 수동 트리거.
// vault scan → mtime 기준 변경 감지 → OpenAI 임베딩(text-embedding-3-small@1024) → upsert/delete.
// Phase 3 단일 사용자 dev 환경 기준. 인증 통과한 사용자만 실행 가능.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { syncObsidianVault } from "@/lib/obsidian/sync";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let summary;
  try {
    summary = await syncObsidianVault();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 500 },
    );
  }

  // users.settings_json.lastObsidianSync 기록 (UI 분기용, 캘린더 sync와 동일 패턴).
  try {
    const userId = await ensureUser(user);
    const summaryForJson = {
      at: new Date().toISOString(),
      scanned: summary.scanned,
      upserted: summary.upserted,
      unchanged: summary.unchanged,
      deleted: summary.deleted,
      errors: summary.errors.slice(0, 5),
    };
    await db
      .update(users)
      .set({
        settingsJson: sql`
          COALESCE(${users.settingsJson}, '{}'::jsonb)
          || jsonb_build_object('lastObsidianSync', ${JSON.stringify(summaryForJson)}::jsonb)
        `,
      })
      .where(eq(users.id, userId));
  } catch (e) {
    console.error("[sync/obsidian] settings update failed:", e);
  }

  return NextResponse.json({
    ok: true,
    ...summary,
  });
}
