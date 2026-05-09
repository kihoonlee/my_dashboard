// GET /api/calendar/agenda?days=1|7
// calendar_events_cache에서 오늘 ~ +days 윈도우 이벤트를 시간순 반환.
// /today 페이지가 호출. 동기화는 /api/sync/calendar 별도 트리거.
// users.settings_json.lastCalendarSync 도 함께 반환해 "동기화한 적 있음 / 없음" 구분.

import { NextResponse, type NextRequest } from "next/server";
import { asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarEventsCache, users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";

type LastSync = { at: string; count: number; deletedStale?: number };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.max(
    1,
    Math.min(30, parseInt(searchParams.get("days") ?? "1", 10) || 1),
  );

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      id: calendarEventsCache.id,
      title: calendarEventsCache.title,
      startAt: calendarEventsCache.startAt,
      endAt: calendarEventsCache.endAt,
      location: calendarEventsCache.location,
      attendees: calendarEventsCache.attendees,
      syncedAt: calendarEventsCache.syncedAt,
      calendarSummary: calendarEventsCache.calendarSummary,
      calendarColorHex: calendarEventsCache.calendarColorHex,
    })
    .from(calendarEventsCache)
    .where(between(calendarEventsCache.startAt, start, end))
    .orderBy(asc(calendarEventsCache.startAt));

  // settings_json에서 마지막 sync 정보 (있으면) — "0건 sync vs never sync" 구분용.
  let lastSync: LastSync | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const userId = await ensureUser(user);
      const [row] = await db
        .select({ settings: users.settingsJson })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const settings = (row?.settings ?? {}) as {
        lastCalendarSync?: LastSync;
      };
      if (settings.lastCalendarSync) lastSync = settings.lastCalendarSync;
    }
  } catch {
    // settings 조회 실패는 agenda 응답을 막지 않음 — events만이라도 반환.
  }

  return NextResponse.json({
    days,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    events: rows,
    lastSync,
  });
}
