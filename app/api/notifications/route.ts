// GET   /api/notifications?unread=true&limit=50 — 알림 리스트
// PATCH /api/notifications — { ids: string[], read: boolean } 읽음/안읽음 토글
//
// 헤더 종 배지가 unread count 폴링 (또는 Supabase Realtime 구독).

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Math.min(
    100,
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
  );

  const where = unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ unread }] = await db
    .select({
      unread: sql<number>`coalesce(count(*) filter (where ${notifications.readAt} is null), 0)::int`,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId));

  return NextResponse.json({
    count: rows.length,
    unread,
    items: rows,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: { ids?: string[]; read?: boolean; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const read = body.read ?? true;

  if (body.all) {
    await db
      .update(notifications)
      .set({ readAt: read ? new Date() : null })
      .where(eq(notifications.userId, userId));
    return NextResponse.json({ ok: true, scope: "all" });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids or all required" }, { status: 400 });
  }

  await db
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(
      and(eq(notifications.userId, userId), inArray(notifications.id, ids)),
    );

  return NextResponse.json({ ok: true, scope: "ids", count: ids.length });
}
