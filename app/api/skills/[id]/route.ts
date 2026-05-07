// PATCH  /api/skills/[id] — 메타 부분 갱신
// DELETE /api/skills/[id]
// POST   /api/skills/[id]/use — 사용 기록 (usage_count + last_used_at 갱신)

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { claudeSkills } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const { id } = await params;

  let body: {
    name?: string;
    description?: string | null;
    scope?: string;
    category?: string | null;
    version?: string | null;
    filePath?: string | null;
    tags?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.scope !== undefined) update.scope = body.scope;
  if (body.category !== undefined) update.category = body.category;
  if (body.version !== undefined) update.version = body.version;
  if (body.filePath !== undefined) update.filePath = body.filePath;
  if (Array.isArray(body.tags))
    update.tags = body.tags.filter((t) => typeof t === "string");
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const [row] = await db
    .update(claudeSkills)
    .set(update)
    .where(eq(claudeSkills.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ skill: row });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await db.delete(claudeSkills).where(eq(claudeSkills.id, id));
  return NextResponse.json({ ok: true });
}

void sql;
