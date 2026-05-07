// GET  /api/news/briefing?date=YYYY-MM-DD (기본 오늘) — 저장된 데일리 브리핑 조회.
// POST /api/news/briefing — 오늘자 새 브리핑 생성 (LLM 호출 1회).

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyBriefings } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateDailyBriefing } from "@/lib/news/briefing";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? todayIso();
  const [row] = await db
    .select()
    .from(dailyBriefings)
    .where(eq(dailyBriefings.date, date))
    .limit(1);
  if (!row) return NextResponse.json({ briefing: null });
  return NextResponse.json({ briefing: row });
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const r = await generateDailyBriefing();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "generate_failed", message: msg },
      { status: 500 },
    );
  }
}
