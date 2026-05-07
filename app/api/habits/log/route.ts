// POST /api/habits/log
// body: { habitId, date (YYYY-MM-DD, 기본 오늘), completed (bool), note? }
// upsert habit_logs (habitId+date unique).

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habitLogs } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    habitId?: string;
    date?: string;
    completed?: boolean;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const habitId = body.habitId;
  if (!habitId) {
    return NextResponse.json({ error: "habitId required" }, { status: 400 });
  }
  const date = body.date ?? todayIso();
  const completed = body.completed ?? true;
  const note = body.note ?? null;

  await db
    .insert(habitLogs)
    .values({ habitId, date, completed, note })
    .onConflictDoUpdate({
      target: [habitLogs.habitId, habitLogs.date],
      set: { completed, note },
    });

  return NextResponse.json({ ok: true, habitId, date, completed });
}

void sql;
