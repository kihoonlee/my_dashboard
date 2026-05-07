// GET  /api/learnings?limit= — 목록
// POST /api/learnings — { content, tags?, source? }
// DELETE /api/learnings?id= — 삭제

import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learnings } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = Math.max(
    1,
    Math.min(200, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50),
  );
  const rows = await db
    .select()
    .from(learnings)
    .orderBy(desc(learnings.createdAt))
    .limit(limit);
  return NextResponse.json({ learnings: rows });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { content?: string; tags?: string[]; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const [row] = await db
    .insert(learnings)
    .values({
      content,
      tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [],
      source: body.source ?? null,
    })
    .returning();
  return NextResponse.json({ learning: row });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await db.delete(learnings).where(eq(learnings.id, id));
  return NextResponse.json({ ok: true });
}
