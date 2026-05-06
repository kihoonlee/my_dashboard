// POST /api/sync/calendar
// 사용자의 Google Calendar(primary)에서 오늘 ~ +7일 윈도우의 이벤트를 가져와
// calendar_events_cache 테이블에 upsert. 수동 트리거 (/today 페이지 버튼) +
// Phase 7 진입 시 5분 cron으로도 호출 예정.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarEventsCache } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import {
  GoogleAuthError,
  getAccessTokenForUser,
  listCalendarEvents,
} from "@/lib/google/calendar";

function eventInstant(
  side: { dateTime?: string; date?: string },
): Date | null {
  if (side.dateTime) return new Date(side.dateTime);
  if (side.date) return new Date(`${side.date}T00:00:00`);
  return null;
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await ensureUser(user);

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForUser(userId);
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      return NextResponse.json(
        {
          error: "reauth_required",
          message: e.message,
        },
        { status: 412 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "token_refresh_failed", message: msg },
      { status: 500 },
    );
  }

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 7);
  timeMax.setHours(23, 59, 59, 999);

  let events;
  try {
    events = await listCalendarEvents({
      accessToken,
      timeMin,
      timeMax,
      maxResults: 100,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "events_fetch_failed", message: msg },
      { status: 502 },
    );
  }

  let upserts = 0;
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    const startAt = eventInstant(ev.start);
    const endAt = eventInstant(ev.end);
    if (!startAt || !endAt) continue;

    const title = ev.summary?.trim() || "(제목 없음)";
    const attendees = ev.attendees ?? [];
    const location = ev.location ?? null;

    await db
      .insert(calendarEventsCache)
      .values({
        googleEventId: ev.id,
        title,
        startAt,
        endAt,
        attendees,
        location,
        rawJson: ev as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: calendarEventsCache.googleEventId,
        set: {
          title,
          startAt,
          endAt,
          attendees,
          location,
          rawJson: ev as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        },
      });
    upserts++;
  }

  // 윈도우 시작점 이전의 stale 이벤트 정리 (지난 일정은 캐시에 두지 않음 — 하영이 헷갈리지 않게)
  const deleted = await db.execute<{ count: number }>(sql`
    WITH d AS (
      DELETE FROM calendar_events_cache WHERE start_at < ${timeMin} RETURNING 1
    )
    SELECT count(*)::int AS count FROM d
  `);

  return NextResponse.json({
    ok: true,
    upserts,
    deletedStale: deleted[0]?.count ?? 0,
    windowStart: timeMin.toISOString(),
    windowEnd: timeMax.toISOString(),
    syncedAt: new Date().toISOString(),
  });
}
