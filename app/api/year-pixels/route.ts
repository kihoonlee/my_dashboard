// GET  /api/year-pixels?year= — 연도 한 번에 365일 분 조회 (없는 날은 빠짐)
// POST /api/year-pixels — { date, moodScore (1-5), colorHex?, note? } upsert

import { NextResponse, type NextRequest } from "next/server";
import { and, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { yearPixels } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COLOR_BY_SCORE: Record<number, string> = {
  1: "#dc2626",
  2: "#fb923c",
  3: "#facc15",
  4: "#84cc16",
  5: "#16a34a",
};

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const rows = await db
    .select()
    .from(yearPixels)
    .where(and(gte(yearPixels.date, start), lt(yearPixels.date, end)));

  return NextResponse.json({ year, pixels: rows });
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
    date?: string;
    moodScore?: number;
    colorHex?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const date = body.date;
  const moodScore = body.moodScore;
  if (
    !date ||
    typeof moodScore !== "number" ||
    moodScore < 1 ||
    moodScore > 5
  ) {
    return NextResponse.json(
      { error: "date and moodScore (1-5) required" },
      { status: 400 },
    );
  }
  const colorHex = body.colorHex ?? COLOR_BY_SCORE[Math.round(moodScore)];

  await db.execute(sql`
    INSERT INTO year_pixels (date, mood_score, color_hex, note, created_at)
    VALUES (${date}::date, ${moodScore}, ${colorHex}, ${body.note ?? null}, now())
    ON CONFLICT (date) DO UPDATE SET
      mood_score = EXCLUDED.mood_score,
      color_hex = EXCLUDED.color_hex,
      note = EXCLUDED.note
  `);

  return NextResponse.json({ ok: true, date, moodScore, colorHex });
}
