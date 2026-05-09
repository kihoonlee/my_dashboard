// 캘린더 동기화 본체.
// /api/sync/calendar (수동) + /api/cron/calendar-sync (5분 cron) 양쪽에서 호출.
// 사용자가 표시(selected) 켜놓은 모든 캘린더(공휴일, 구독, 공유 포함)의 이벤트를
// 오늘 ~ +7일 윈도우로 calendar_events_cache에 통합 upsert.

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarEventsCache, users } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";
import {
  GoogleAuthError,
  getAccessTokenForUser,
  listCalendarEvents,
  listCalendars,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from "@/lib/google/calendar";

function eventInstant(
  side: { dateTime?: string; date?: string },
): Date | null {
  if (side.dateTime) return new Date(side.dateTime);
  if (side.date) return new Date(`${side.date}T00:00:00`);
  return null;
}

function calendarDisplayName(c: GoogleCalendarListEntry): string | null {
  return c.summaryOverride?.trim() || c.summary?.trim() || null;
}

export type CalendarSyncSummary = {
  at: string;
  count: number;
  deletedStale: number;
  calendarsSynced: number;
  errors: string[];
  source?: "manual" | "cron";
};

export type CalendarSyncResult = {
  ok: true;
  summary: CalendarSyncSummary;
  windowStart: string;
  windowEnd: string;
};

/**
 * 사용자 한 명의 모든 selected 캘린더를 오늘 ~ +7일 윈도우로 동기화.
 * - 인증 실패는 GoogleAuthError throw (호출 측에서 needsReauth 판단)
 * - 일부 캘린더 fetch 실패는 errors[]에 모아서 진행
 */
export async function syncCalendarForUser(
  userId: string,
  options: { source?: "manual" | "cron" } = {},
): Promise<CalendarSyncResult> {
  const accessToken = await getAccessTokenForUser(userId);

  const calendars = await listCalendars({ accessToken });

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 7);
  timeMax.setHours(23, 59, 59, 999);

  const errors: string[] = [];

  const fetched = await Promise.allSettled(
    calendars.map(async (cal) => {
      const events = await listCalendarEvents({
        accessToken,
        calendarId: cal.id,
        timeMin,
        timeMax,
        maxResults: 250,
      });
      return { cal, events };
    }),
  );

  let upserts = 0;

  for (let i = 0; i < fetched.length; i++) {
    const result = fetched[i];
    const cal = calendars[i];
    if (result.status === "rejected") {
      const msg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      errors.push(`${calendarDisplayName(cal) ?? cal.id}: ${msg}`);
      continue;
    }
    const { events } = result.value;
    const calendarSummary = calendarDisplayName(cal);
    const calendarColorHex = cal.backgroundColor ?? null;

    for (const ev of events as GoogleCalendarEvent[]) {
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
          calendarId: cal.id,
          calendarSummary,
          calendarColorHex,
          googleEventId: ev.id,
          title,
          startAt,
          endAt,
          attendees,
          location,
          rawJson: ev as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [
            calendarEventsCache.calendarId,
            calendarEventsCache.googleEventId,
          ],
          set: {
            calendarSummary,
            calendarColorHex,
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
  }

  // 윈도우 시작 이전 stale 정리 — 모든 calendarId 통틀어. 지난 일정은 캐시에 안 둠.
  const deleted = await db.execute<{ count: number }>(sql`
    WITH d AS (
      DELETE FROM calendar_events_cache WHERE start_at < ${tsTz(timeMin)} RETURNING 1
    )
    SELECT count(*)::int AS count FROM d
  `);

  const summary: CalendarSyncSummary = {
    at: new Date().toISOString(),
    count: upserts,
    deletedStale: deleted[0]?.count ?? 0,
    calendarsSynced: calendars.length,
    errors,
    ...(options.source ? { source: options.source } : {}),
  };

  await db
    .update(users)
    .set({
      settingsJson: sql`
        COALESCE(${users.settingsJson}, '{}'::jsonb)
        || jsonb_build_object('lastCalendarSync', ${JSON.stringify(summary)}::jsonb)
      `,
    })
    .where(eq(users.id, userId));

  return {
    ok: true,
    summary,
    windowStart: timeMin.toISOString(),
    windowEnd: timeMax.toISOString(),
  };
}

export { GoogleAuthError };
