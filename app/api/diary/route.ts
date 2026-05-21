// GET  /api/diary?from=YYYY-MM-DD&to=YYYY-MM-DD — 날짜 범위 일기 리스트 (기본 최근 30일)
// POST /api/diary — 일기 upsert (entryDate 기준)
//   body: { entryDate: "YYYY-MM-DD", title?, bodyMd, mood? }

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { diaryEntries } from "@/lib/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [eq(diaryEntries.userId, userId)];
  if (from) conditions.push(gte(diaryEntries.entryDate, from));
  if (to) conditions.push(lte(diaryEntries.entryDate, to));

  const rows = await db
    .select({
      id: diaryEntries.id,
      entryDate: diaryEntries.entryDate,
      title: diaryEntries.title,
      mood: diaryEntries.mood,
      updatedAt: diaryEntries.updatedAt,
    })
    .from(diaryEntries)
    .where(and(...conditions))
    .orderBy(desc(diaryEntries.entryDate))
    .limit(60);

  return NextResponse.json({ count: rows.length, items: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: {
    entryDate?: string;
    title?: string;
    bodyMd?: string;
    mood?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const entryDate = body.entryDate;
  if (!entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return NextResponse.json(
      { error: "entryDate must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  const bodyMd = body.bodyMd ?? "";
  const title = body.title ?? null;
  const mood = body.mood ?? null;

  const [row] = await db
    .insert(diaryEntries)
    .values({ userId, entryDate, title, bodyMd, mood })
    .onConflictDoUpdate({
      target: [diaryEntries.userId, diaryEntries.entryDate],
      set: { title, bodyMd, mood, updatedAt: new Date() },
    })
    .returning({
      id: diaryEntries.id,
      entryDate: diaryEntries.entryDate,
      updatedAt: diaryEntries.updatedAt,
    });

  return NextResponse.json(row);
}
