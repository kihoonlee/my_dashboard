// GET  /api/skills?scope=&category= — Claude Code skill 목록
// POST /api/skills — { name, description?, scope?, category?, version?, filePath?, tags? }

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { claudeSkills } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const category = searchParams.get("category");
  const conditions = [];
  if (scope) conditions.push(eq(claudeSkills.scope, scope));
  if (category) conditions.push(eq(claudeSkills.category, category));

  const rows = await db
    .select()
    .from(claudeSkills)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(claudeSkills.lastUsedAt));
  return NextResponse.json({ skills: rows });
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
    scope?: string;
    category?: string;
    version?: string;
    filePath?: string;
    projectPath?: string;
    tags?: string[];
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
    .insert(claudeSkills)
    .values({
      name,
      description: body.description ?? null,
      scope: body.scope ?? "global",
      category: body.category ?? null,
      version: body.version ?? null,
      filePath: body.filePath ?? null,
      projectPath: body.projectPath ?? null,
      tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [],
    })
    .returning();
  return NextResponse.json({ skill: row });
}
