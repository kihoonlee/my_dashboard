// 5분마다 — 캘린더 동기화 (Pro tier 필요).
// vercel.json schedule: "*/5 * * * *"
//
// 단일 사용자 가정. 다중 사용자 시점에 user 순회로 변경.

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarEventsCache, users } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";
import { verifyCronRequest, getCronUserId } from "@/lib/cron/auth";
import {
  GoogleAuthError,
  getAccessTokenForUser,
  listCalendarEvents,
} from "@/lib/google/calendar";

function eventInstant(side: { dateTime?: string; date?: string }): Date | null {
  if (side.dateTime) return new Date(side.dateTime);
  if (side.date) return new Date(`${side.date}T00:00:00`);
  return null;
}

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

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForUser(userId);
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      return NextResponse.json(
        { ok: false, error: "reauth_required", message: e.message },
        { status: 200 }, // cron은 200 OK로 graceful 처리 (반복 실패 방지)
      );
    }
    return NextResponse.json(
      { error: "token_refresh_failed" },
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
    await db
      .insert(calendarEventsCache)
      .values({
        googleEventId: ev.id,
        title,
        startAt,
        endAt,
        attendees: ev.attendees ?? [],
        location: ev.location ?? null,
        rawJson: ev as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: calendarEventsCache.googleEventId,
        set: {
          title,
          startAt,
          endAt,
          attendees: ev.attendees ?? [],
          location: ev.location ?? null,
          rawJson: ev as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        },
      });
    upserts++;
  }

  // stale 정리
  const deleted = await db.execute<{ count: number }>(sql`
    WITH d AS (
      DELETE FROM calendar_events_cache WHERE start_at < ${tsTz(timeMin)} RETURNING 1
    )
    SELECT count(*)::int AS count FROM d
  `);

  // settings_json 갱신
  const summary = {
    at: new Date().toISOString(),
    count: upserts,
    deletedStale: deleted[0]?.count ?? 0,
    source: "cron",
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

  return NextResponse.json({
    ok: true,
    upserts,
    deletedStale: summary.deletedStale,
  });
}
