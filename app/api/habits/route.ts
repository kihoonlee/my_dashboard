// GET  /api/habits?includeArchived=true — 목록 + 최근 14일 로그 합산
// POST /api/habits — 신규

import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habits, habitLogs } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived") === "true";
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceDate = since.toISOString().slice(0, 10);

  const rows = await db.execute<{
    id: string;
    name: string;
    description: string | null;
    target_frequency: string;
    color_hex: string | null;
    archived: boolean;
    created_at: Date;
    completed_count: number;
    log_count: number;
  }>(sql`
    SELECT
      h.id::text AS id,
      h.name,
      h.description,
      h.target_frequency,
      h.color_hex,
      h.archived,
      h.created_at,
      COUNT(*) FILTER (WHERE l.completed = true)::int AS completed_count,
      COUNT(l.id)::int AS log_count
    FROM habits h
    LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date >= ${sinceDate}::date
    ${includeArchived ? sql`` : sql`WHERE h.archived = false`}
    GROUP BY h.id
    ORDER BY h.archived ASC, h.created_at ASC
  `);

  return NextResponse.json({
    habits: (rows as unknown as Array<{
      id: string;
      name: string;
      description: string | null;
      target_frequency: string;
      color_hex: string | null;
      archived: boolean;
      created_at: Date;
      completed_count: number;
      log_count: number;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      targetFrequency: r.target_frequency,
      colorHex: r.color_hex,
      archived: r.archived,
      createdAt: r.created_at,
      completed14d: r.completed_count,
      logCount14d: r.log_count,
      completionRate14d:
        r.log_count > 0 ? r.completed_count / r.log_count : 0,
    })),
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

  let body: {
    name?: string;
    description?: string;
    targetFrequency?: string;
    colorHex?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const [row] = await db
    .insert(habits)
    .values({
      name,
      description: body.description ?? null,
      targetFrequency: body.targetFrequency ?? "daily",
      colorHex: body.colorHex ?? null,
    })
    .returning();
  return NextResponse.json({ habit: row });
}

void and;
void eq;
void gte;
void habitLogs;
