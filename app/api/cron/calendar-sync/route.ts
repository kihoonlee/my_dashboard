// 5분마다 — 캘린더 동기화 (Pro tier 필요).
// vercel.json schedule: "*/5 * * * *"
//
// 사용자가 표시(selected) 켜놓은 모든 캘린더(구독 포함)를 한 번에 동기화.
// 단일 사용자 가정. 다중 사용자 시점에 user 순회로 변경.

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest, getCronUserId } from "@/lib/cron/auth";
import {
  GoogleAuthError,
  syncCalendarForUser,
} from "@/lib/google/calendar-sync";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const userId = await getCronUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "no cron user (set ALLOWED_EMAIL)" },
      { status: 400 },
    );
  }

  try {
    const result = await syncCalendarForUser(userId, { source: "cron" });
    return NextResponse.json({
      ok: true,
      upserts: result.summary.count,
      deletedStale: result.summary.deletedStale,
      calendarsSynced: result.summary.calendarsSynced,
      errors: result.summary.errors,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      // cron은 200 OK로 graceful 처리 (반복 실패 방지)
      return NextResponse.json(
        { ok: false, error: "reauth_required", message: e.message },
        { status: 200 },
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
