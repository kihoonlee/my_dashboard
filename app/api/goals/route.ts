// GET  /api/goals?status=active|done|paused — 목록
// POST /api/goals — 신규 (title, description?, type?, targetDate?)

import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { goals } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = request.nextUrl.searchParams.get("status");

  let rows;
  if (status) {
    rows = await db
      .select()
      .from(goals)
      .where(eq(goals.status, status))
      .orderBy(desc(goals.createdAt));
  } else {
    rows = await db.select().from(goals).orderBy(desc(goals.createdAt));
  }
  return NextResponse.json({ goals: rows });
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
    title?: string;
    description?: string;
    type?: string;
    targetDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const [row] = await db
    .insert(goals)
    .values({
      title,
      description: body.description ?? null,
      type: body.type ?? "quarter",
      targetDate: body.targetDate ?? null,
    })
    .returning();
  return NextResponse.json({ goal: row });
}
