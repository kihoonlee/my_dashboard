// GET  /api/read-later?status=&limit= — 읽을거리 큐
// POST /api/read-later — { url, title?, priority?, tags? } 신규

import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { readLater } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") ?? "unread";
  const limit = Math.max(
    1,
    Math.min(200, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50),
  );

  const rows = await db
    .select()
    .from(readLater)
    .where(eq(readLater.status, status))
    .orderBy(desc(readLater.savedAt))
    .limit(limit);
  return NextResponse.json({ items: rows });
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
    url?: string;
    title?: string;
    priority?: string;
    tags?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "url must start with http(s)://" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(readLater)
    .values({
      url,
      title: body.title ?? null,
      domain: extractDomain(url),
      priority: body.priority ?? "medium",
      status: "unread",
      tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [],
    })
    .returning();
  return NextResponse.json({ item: row });
}
