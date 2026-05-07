// GET /api/news/sources — 사용자 등록 RSS source 목록.
// POST   /api/news/sources — body { name, url, category?, type? } 신규 추가.
// DELETE /api/news/sources?id= — 삭제.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsSources } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db.select().from(newsSources).orderBy(newsSources.name);
  return NextResponse.json({ sources: rows });
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
    url?: string;
    category?: string;
    type?: string;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = body.name?.trim();
  const url = body.url?.trim();
  if (!name || !url) {
    return NextResponse.json(
      { error: "name and url required" },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "url must start with http(s)://" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(newsSources)
    .values({
      name,
      url,
      type: body.type ?? "rss",
      category: body.category ?? null,
      active: body.active ?? true,
    })
    .returning();

  return NextResponse.json({ source: row });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await db.delete(newsSources).where(eq(newsSources.id, id));
  return NextResponse.json({ ok: true });
}
