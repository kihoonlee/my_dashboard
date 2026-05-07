// GET /api/skills/stats — 카테고리별 카운트 + 30일 사용 top + stale 후보

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { claudeSkills, skillUsageLogs } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const byCategory = (await db.execute<{ category: string; cnt: number }>(sql`
    SELECT COALESCE(category, '미분류') AS category, COUNT(*)::int AS cnt
    FROM ${claudeSkills}
    GROUP BY category
    ORDER BY cnt DESC
  `)) as unknown as Array<{ category: string; cnt: number }>;

  const top30d = (await db.execute<{ name: string; uses: number }>(sql`
    SELECT s.name, COUNT(l.id)::int AS uses
    FROM ${claudeSkills} s
    LEFT JOIN ${skillUsageLogs} l ON l.skill_id = s.id AND l.used_at >= now() - interval '30 days'
    GROUP BY s.id, s.name
    HAVING COUNT(l.id) > 0
    ORDER BY uses DESC
    LIMIT 10
  `)) as unknown as Array<{ name: string; uses: number }>;

  const stale = (await db.execute<{
    id: string;
    name: string;
    last_used_at: Date | null;
  }>(sql`
    SELECT s.id::text AS id, s.name, s.last_used_at
    FROM ${claudeSkills} s
    WHERE s.last_used_at IS NULL OR s.last_used_at < now() - interval '30 days'
    ORDER BY s.last_used_at NULLS FIRST
    LIMIT 20
  `)) as unknown as Array<{ id: string; name: string; last_used_at: Date | null }>;

  return NextResponse.json({
    totalSkills: byCategory.reduce((acc, r) => acc + r.cnt, 0),
    byCategory,
    top30d,
    staleCandidates: stale,
  });
}
