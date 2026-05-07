// 뉴스 RSS 동기화 + (옵션) AI 한 줄 요약.
//
// 흐름:
// 1. news_sources WHERE active=true → 각 source의 RSS feed fetch
// 2. items 파싱 → news_items upsert (source_id + url unique)
// 3. AI 요약은 비용 큼 → sync 시점엔 skip. 별도 generate_briefing에서만 LLM 사용.
// 4. last_fetched_at 갱신
// 5. settings_json.lastNewsSync 기록

import "server-only";
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsItems, newsSources, users } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";
import { fetchAndParseFeed } from "@/lib/news/rss";

export type NewsSyncSummary = {
  sources: number;
  fetchedTotal: number;
  inserted: number;
  errors: string[];
  durationMs: number;
};

export async function syncNewsSources(params: {
  userId: string;
  /** 한 source당 최대 몇 개 item만 저장할지 (rate-limit성). 기본 30. */
  perSourceLimit?: number;
}): Promise<NewsSyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const perSourceLimit = Math.max(1, Math.min(100, params.perSourceLimit ?? 30));

  const sources = await db
    .select()
    .from(newsSources)
    .where(eq(newsSources.active, true));

  let fetchedTotal = 0;
  let inserted = 0;

  for (const src of sources) {
    try {
      const feed = await fetchAndParseFeed(src.url);
      const items = feed.items.slice(0, perSourceLimit);
      fetchedTotal += items.length;

      // 기존 url diff
      const urls = items.map((i) => i.url).filter((u) => u);
      if (urls.length === 0) continue;
      const existing = await db
        .select({ url: newsItems.url })
        .from(newsItems)
        .where(inArray(newsItems.url, urls));
      const existingSet = new Set(existing.map((r) => r.url));

      for (const it of items) {
        if (!it.url) continue;
        if (existingSet.has(it.url)) continue;
        try {
          await db
            .insert(newsItems)
            .values({
              sourceId: src.id,
              title: it.title || "(제목 없음)",
              url: it.url,
              content: it.description ?? null,
              category: src.category,
              publishedAt: it.publishedAt,
            })
            .onConflictDoNothing({
              target: [newsItems.sourceId, newsItems.url],
            });
          inserted += 1;
        } catch (e) {
          errors.push(`item ${src.name}/${it.url}: ${errMsg(e)}`);
        }
      }

      await db
        .update(newsSources)
        .set({ lastFetchedAt: new Date() })
        .where(eq(newsSources.id, src.id));
    } catch (e) {
      errors.push(`source ${src.name}: ${errMsg(e)}`);
    }
  }

  const summary = {
    at: new Date().toISOString(),
    sources: sources.length,
    fetchedTotal,
    inserted,
  };
  try {
    await db
      .update(users)
      .set({
        settingsJson: sql`
          COALESCE(${users.settingsJson}, '{}'::jsonb)
          || jsonb_build_object('lastNewsSync', ${JSON.stringify(summary)}::jsonb)
        `,
      })
      .where(eq(users.id, params.userId));
  } catch (e) {
    errors.push(`settings update failed: ${errMsg(e)}`);
  }

  return {
    sources: sources.length,
    fetchedTotal,
    inserted,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

void tsTz;
