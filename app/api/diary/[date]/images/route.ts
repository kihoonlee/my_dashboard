// POST /api/diary/[date]/images
//   body: { storagePath: string, caption?: string }
//   client가 Supabase Storage `diary` bucket에 직접 업로드한 뒤 path를 등록.
//   일기 row가 없으면 자동 생성 (빈 본문).
//
// DELETE /api/diary/[date]/images?id=<imageId>

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { diaryEntries, diaryImages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  let body: { storagePath?: string; caption?: string; sortOrder?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const storagePath = body.storagePath?.trim();
  if (!storagePath) {
    return NextResponse.json({ error: "storagePath required" }, { status: 400 });
  }

  // 일기 row 확보 (없으면 빈 본문으로 생성)
  let [entry] = await db
    .select({ id: diaryEntries.id })
    .from(diaryEntries)
    .where(
      and(eq(diaryEntries.userId, userId), eq(diaryEntries.entryDate, date)),
    )
    .limit(1);
  if (!entry) {
    const [created] = await db
      .insert(diaryEntries)
      .values({ userId, entryDate: date, bodyMd: "" })
      .returning({ id: diaryEntries.id });
    entry = created;
  }

  const [row] = await db
    .insert(diaryImages)
    .values({
      entryId: entry.id,
      storagePath,
      caption: body.caption ?? null,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json(row);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { date } = await params;

  const imageId = new URL(request.url).searchParams.get("id");
  if (!imageId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // ownership 검증: 이미지 → entry → userId 일치 확인
  const [img] = await db
    .select({ entryId: diaryImages.entryId })
    .from(diaryImages)
    .where(eq(diaryImages.id, imageId))
    .limit(1);
  if (!img) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const [entry] = await db
    .select({ userId: diaryEntries.userId, date: diaryEntries.entryDate })
    .from(diaryEntries)
    .where(eq(diaryEntries.id, img.entryId))
    .limit(1);
  if (!entry || entry.userId !== userId || entry.date !== date) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.delete(diaryImages).where(eq(diaryImages.id, imageId));
  return NextResponse.json({ ok: true });
}
