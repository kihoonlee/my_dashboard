// POST /api/sync/calendar
// 사용자가 Google Calendar에서 표시(selected) 켜놓은 모든 캘린더(공휴일·구독·공유 포함)
// 의 이벤트를 오늘 ~ +7일 윈도우로 calendar_events_cache에 통합 upsert.
// 수동 트리거 (/today, /settings 페이지 버튼). 5분 cron은 /api/cron/calendar-sync.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import {
  GoogleAuthError,
  syncCalendarForUser,
} from "@/lib/google/calendar-sync";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await ensureUser(user);

  try {
    const result = await syncCalendarForUser(userId, { source: "manual" });
    return NextResponse.json({
      ok: true,
      upserts: result.summary.count,
      deletedStale: result.summary.deletedStale,
      calendarsSynced: result.summary.calendarsSynced,
      errors: result.summary.errors,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      syncedAt: result.summary.at,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      return NextResponse.json(
        { error: "reauth_required", message: e.message },
        { status: 412 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: "google_api_failed", message: msg },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 500 },
    );
  }
}
