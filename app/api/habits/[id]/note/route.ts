// PATCH /api/habits/[id]/note
// body: { date: "YYYY-MM-DD", note: string | null }
// habit_log upsert (note만 변경, completed는 기존 값 유지 또는 false 기본).

import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habitLogs } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: habitId } = await params;

  let body: { date?: string; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const date = body.date ?? todayIso();
  const note = body.note ?? null;

  // 기존 로그가 있으면 note만 업데이트, 없으면 completed=false로 새로 만듦
  const [existing] = await db
    .select()
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
    .limit(1);

  if (existing) {
    await db
      .update(habitLogs)
      .set({ note })
      .where(eq(habitLogs.id, existing.id));
  } else {
    await db
      .insert(habitLogs)
      .values({ habitId, date, completed: false, note });
  }

  return NextResponse.json({ ok: true, habitId, date, note });
}
