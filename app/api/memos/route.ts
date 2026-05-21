// GET  /api/memos?archived=false&from=YYYY-MM-DD&to=YYYY-MM-DD
// POST /api/memos — 신규 메모 (entryDate 기본 오늘)
//   body: { title?, bodyMd, entryDate? }

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { memos } from "@/lib/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const archived = searchParams.get("archived") === "true";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [
    eq(memos.userId, userId),
    eq(memos.archived, archived),
  ];
  if (from) conditions.push(gte(memos.entryDate, from));
  if (to) conditions.push(lte(memos.entryDate, to));

  const rows = await db
    .select({
      id: memos.id,
      entryDate: memos.entryDate,
      title: memos.title,
      bodyMd: memos.bodyMd,
      pinned: memos.pinned,
      updatedAt: memos.updatedAt,
    })
    .from(memos)
    .where(and(...conditions))
    .orderBy(desc(memos.pinned), desc(memos.entryDate), desc(memos.updatedAt))
    .limit(100);

  return NextResponse.json({ count: rows.length, items: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: { title?: string; bodyMd?: string; entryDate?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const entryDate =
    body.entryDate && /^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)
      ? body.entryDate
      : new Date().toISOString().slice(0, 10);

  const [row] = await db
    .insert(memos)
    .values({
      userId,
      entryDate,
      title: body.title ?? null,
      bodyMd: body.bodyMd ?? "",
    })
    .returning();

  return NextResponse.json(row);
}
