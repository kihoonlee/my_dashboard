// GET    /api/diary/[date] — 특정 날짜 일기 (없으면 null) + 이미지 목록
// DELETE /api/diary/[date] — 일기 삭제 (이미지는 cascade)

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { diaryEntries, diaryImages } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const [entry] = await db
    .select()
    .from(diaryEntries)
    .where(
      and(eq(diaryEntries.userId, userId), eq(diaryEntries.entryDate, date)),
    )
    .limit(1);

  if (!entry) {
    return NextResponse.json({ entry: null, images: [] });
  }

  const images = await db
    .select()
    .from(diaryImages)
    .where(eq(diaryImages.entryId, entry.id))
    .orderBy(asc(diaryImages.sortOrder), asc(diaryImages.createdAt));

  return NextResponse.json({ entry, images });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  await db
    .delete(diaryEntries)
    .where(
      and(eq(diaryEntries.userId, userId), eq(diaryEntries.entryDate, date)),
    );

  return NextResponse.json({ ok: true });
}
