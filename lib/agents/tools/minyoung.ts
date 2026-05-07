// 민영(news_curator) 전용 tool.
// 도구:
//   - get_today_briefing(): 오늘자 daily_briefings 조회 (없으면 null + 안내)
//   - generate_briefing(): 새로 생성 (LLM 호출 1회 — Haiku) → 저장 후 반환
//   - list_recent_news(category?, hours?, limit?): news_items 최근 N건
//   - list_sources(): 활성 RSS source 목록

import { db } from "@/lib/db/client";
import { dailyBriefings, newsItems, newsSources } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";
import { generateDailyBriefing } from "@/lib/news/briefing";

export const MINYOUNG_TOOLS: AgentTool[] = [
  {
    name: "get_today_briefing",
    description:
      "오늘자 데일리 뉴스 브리핑을 daily_briefings에서 조회. 사용자가 '오늘 뉴스 뭐 있어?' 물을 때 가장 먼저. 없으면 generate_briefing 안내.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_briefing",
    description:
      "최근 24h 수집된 news_items를 LLM으로 요약해 오늘자 브리핑 생성. 비용 발생(Haiku ~$0.005). 같은 day 재호출 시 덮어쓰기. get_today_briefing이 null이거나 사용자가 명시적으로 '새로 만들어줘'라고 할 때만.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_recent_news",
    description:
      "최근 수집된 news_items 목록. 카테고리 필터 + 시간 윈도우(시간 단위).",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "카테고리 필터 (선택)" },
        hours: {
          type: "number",
          description: "최근 몇 시간 (기본 24, 최대 168)",
        },
        limit: {
          type: "number",
          description: "최대 결과 수 (기본 20, 최대 100)",
        },
      },
    },
  },
  {
    name: "list_sources",
    description:
      "등록된 RSS source 목록. 카테고리 필터링 또는 새 source 등록 안내용.",
    input_schema: { type: "object", properties: {} },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function runMinyoungTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "get_today_briefing": {
        const date = todayIso();
        const [row] = await db
          .select()
          .from(dailyBriefings)
          .where(eq(dailyBriefings.date, date))
          .limit(1);
        if (!row) {
          return {
            ok: true,
            result: {
              date,
              briefing: null,
              note:
                "오늘 브리핑이 아직 없습니다. 사용자에게 generate_briefing 호출을 권하거나, /news 페이지에서 '브리핑 생성' 버튼 안내.",
            },
          };
        }
        return {
          ok: true,
          result: {
            date,
            intro: row.hyewonIntro,
            sections: row.sectionsJson,
            generatedAt: row.generatedAt,
          },
        };
      }
      case "generate_briefing": {
        const r = await generateDailyBriefing();
        return {
          ok: true,
          result: {
            date: r.date,
            intro: r.briefing.intro,
            sections: r.briefing.sections,
            itemsConsidered: r.itemsConsidered,
            costUsd: r.costUsd,
          },
        };
      }
      case "list_recent_news": {
        const category = asString(input.category);
        const hours = Math.max(
          1,
          Math.min(
            168,
            typeof input.hours === "number"
              ? input.hours
              : parseInt(asString(input.hours) ?? "24", 10) || 24,
          ),
        );
        const limit = Math.max(
          1,
          Math.min(
            100,
            typeof input.limit === "number"
              ? input.limit
              : parseInt(asString(input.limit) ?? "20", 10) || 20,
          ),
        );
        const since = new Date();
        since.setHours(since.getHours() - hours);
        const conds = [gte(newsItems.fetchedAt, since)];
        if (category) conds.push(eq(newsItems.category, category));

        const rows = await db
          .select({
            title: newsItems.title,
            url: newsItems.url,
            category: newsItems.category,
            publishedAt: newsItems.publishedAt,
            fetchedAt: newsItems.fetchedAt,
            sourceName: newsSources.name,
          })
          .from(newsItems)
          .leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id))
          .where(and(...conds))
          .orderBy(desc(newsItems.fetchedAt))
          .limit(limit);
        return {
          ok: true,
          result: {
            count: rows.length,
            items: rows,
            note:
              rows.length === 0
                ? "최근 항목이 없습니다. 사용자에게 /news에서 'RSS 동기화'를 안내."
                : undefined,
          },
        };
      }
      case "list_sources": {
        const rows = await db.select().from(newsSources);
        return {
          ok: true,
          result: {
            count: rows.length,
            sources: rows.map((s) => ({
              id: s.id,
              name: s.name,
              url: s.url,
              category: s.category,
              active: s.active,
              lastFetchedAt: s.lastFetchedAt,
            })),
            note:
              rows.length === 0
                ? "등록된 source가 없습니다. /news 페이지에서 RSS URL 등록 안내."
                : undefined,
          },
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `minyoung tool error: ${message}` };
  }
}
