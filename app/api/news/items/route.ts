// GET /api/news/items?category=&hours=&limit= — 최근 news_items.

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsItems, newsSources } from "@/lib/db/schema";
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
  const category = searchParams.get("category");
  const hours = Math.max(
    1,
    Math.min(168, parseInt(searchParams.get("hours") ?? "48", 10) || 48),
  );
  const limit = Math.max(
    1,
    Math.min(200, parseInt(searchParams.get("limit") ?? "100", 10) || 100),
  );

  const since = new Date();
  since.setHours(since.getHours() - hours);

  const conditions = [gte(newsItems.fetchedAt, since)];
  if (category) conditions.push(eq(newsItems.category, category));

  const rows = await db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      url: newsItems.url,
      category: newsItems.category,
      content: newsItems.content,
      publishedAt: newsItems.publishedAt,
      fetchedAt: newsItems.fetchedAt,
      sourceName: newsSources.name,
    })
    .from(newsItems)
    .leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id))
    .where(and(...conditions))
    .orderBy(desc(newsItems.fetchedAt))
    .limit(limit);

  return NextResponse.json({ items: rows });
}
