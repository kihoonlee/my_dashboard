// GET /api/calendar/agenda?days=1|7
// calendar_events_cache에서 오늘 ~ +days 윈도우 이벤트를 시간순 반환.
// /today 페이지가 호출. 동기화는 /api/sync/calendar 별도 트리거.

import { NextResponse, type NextRequest } from "next/server";
import { asc, between } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarEventsCache } from "@/lib/db/schema";

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
    })
    .from(calendarEventsCache)
    .where(between(calendarEventsCache.startAt, start, end))
    .orderBy(asc(calendarEventsCache.startAt));

  return NextResponse.json({
    days,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    events: rows,
  });
}
