// GET  /api/weekly-reviews?weekStart=YYYY-MM-DD (기본 이번 주 월요일) — 단일 회고 조회
// POST /api/weekly-reviews — body { weekStart? } 새로 생성 (덮어쓰기)

import { NextResponse, type NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { weeklyReviews } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWeeklyReview } from "@/lib/reviews/weekly";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfThisWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get("weekStart");
  const weekStart = param ?? isoDate(startOfThisWeek());

  // 단일 + 최근 4주 히스토리
  const [current] = await db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.weekStart, weekStart))
    .limit(1);
  const history = await db
    .select({
      weekStart: weeklyReviews.weekStart,
      todosCompleted: weeklyReviews.todosCompleted,
      habitsCompletionRate: weeklyReviews.habitsCompletionRate,
      githubCommits: weeklyReviews.githubCommits,
    })
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(8);

  return NextResponse.json({
    weekStart,
    review: current ?? null,
    history,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { weekStart?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const r = await generateWeeklyReview(body.weekStart);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "generate_failed", message: msg },
      { status: 500 },
    );
  }
}
