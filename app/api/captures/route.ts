// GET  /api/captures?processed=&limit= — quick_captures 목록
// POST /api/captures — { content, type?, url? } 신규

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { quickCaptures } from "@/lib/db/schema";
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
  const processedRaw = searchParams.get("processed");
  const limit = Math.max(
    1,
    Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
  );

  const conditions = [];
  if (processedRaw === "true" || processedRaw === "false") {
    conditions.push(eq(quickCaptures.processed, processedRaw === "true"));
  }

  const rows = await db
    .select()
    .from(quickCaptures)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quickCaptures.createdAt))
    .limit(limit);
  return NextResponse.json({ captures: rows });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { content?: string; type?: string; url?: string };
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
    .insert(quickCaptures)
    .values({
      content,
      type: body.type ?? "text",
      url: body.url ?? null,
    })
    .returning();
  return NextResponse.json({ capture: row });
}
