// 데일리 뉴스 브리핑 생성 (민영).
// Haiku 4.5 + JSON 응답 강제 + prompt caching.
// 입력: 어제 ~ 오늘 사이의 news_items.
// 출력: 카테고리별 5-7개 항목 (한 줄 요약 + URL) + 인트로 한 단락.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { db } from "@/lib/db/client";
import {
  agents,
  agentLogs,
  dailyBriefings,
  newsItems,
  newsSources,
} from "@/lib/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";

const BRIEFING_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `당신은 통찰력 있고 빠른 뉴스 큐레이터 민영입니다. 어제~오늘 수집된 뉴스 헤드라인을 카테고리별로 정리해 데일리 브리핑을 만듭니다.

원칙:
- 카테고리별로 5-7개 항목. 비슷한 내용은 한 항목으로 묶기.
- 각 항목 한 줄 요약 (15단어 이내, 한국어).
- 한국 시장 영향이 명확한 건은 [한국] 표시.
- 인트로는 오늘 가장 주목할 1-2가지를 한 단락(2-3문장).

응답은 반드시 다음 JSON 형식만:
{
  "intro": "오늘의 핵심 한 단락",
  "sections": [
    {"category": "기술/AI", "items": [{"title": "한 줄 요약", "url": "...", "marker": "한국|null"}]}
  ]
}

JSON 외 텍스트 금지.`;

export type BriefingSection = {
  category: string;
  items: Array<{ title: string; url: string; marker?: string | null }>;
};

export type BriefingPayload = {
  intro: string;
  sections: BriefingSection[];
};

export type GenerateResult = {
  date: string; // YYYY-MM-DD
  briefing: BriefingPayload;
  itemsConsidered: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * 오늘 날짜로 브리핑 생성. 이미 존재하면 기존 행을 update.
 * 입력 윈도우는 최근 24h.
 */
export async function generateDailyBriefing(): Promise<GenerateResult> {
  const date = todayIso();
  const since = new Date();
  since.setHours(since.getHours() - 24);

  // 최근 24h news_items + source 메타
  const items = await db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      url: newsItems.url,
      content: newsItems.content,
      category: newsItems.category,
      publishedAt: newsItems.publishedAt,
      sourceName: newsSources.name,
    })
    .from(newsItems)
    .leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id))
    .where(
      and(
        gte(newsItems.fetchedAt, since), // fetchedAt 기준 (publishedAt이 null인 경우 대비)
      ),
    )
    .limit(150);

  if (items.length === 0) {
    const empty: BriefingPayload = {
      intro:
        "최근 24시간 동안 수집된 뉴스가 없습니다. 사용자에게 /news에서 동기화를 안내하세요.",
      sections: [],
    };
    await upsertBriefing(date, "", empty);
    return {
      date,
      briefing: empty,
      itemsConsidered: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const lines: string[] = [
    `날짜: ${date}`,
    `수집 항목: ${items.length}건`,
    "",
  ];
  for (const it of items) {
    const cat = it.category ?? "general";
    const title = trim(it.title, 200);
    const desc = trim(it.content ?? "", 200);
    lines.push(
      `[${cat}] ${title}${desc ? ` — ${desc}` : ""} (${it.url}) <${it.sourceName ?? "unknown"}>`,
    );
  }

  const res = await invokeAgent({
    model: BRIEFING_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 2500,
    temperature: 0.3,
    messages: [{ role: "user", content: lines.join("\n") }],
    cacheSystemAndTools: true,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = parseBriefing(text);
  const usage = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  };
  const costUsd = calculateCostUsd(BRIEFING_MODEL, usage);

  await upsertBriefing(date, parsed.intro, parsed);

  // agent_logs 기록
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "minyoung"))
      .limit(1);
    if (a?.id) {
      await db.insert(agentLogs).values({
        agentId: a.id,
        trigger: "news_briefing",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        durationMs: 0,
        costUsd: costUsd.toFixed(6),
        isError: false,
        errorMessage: null,
      });
    }
  } catch (e) {
    console.error("[news/briefing] agent_logs insert failed:", e);
  }

  return {
    date,
    briefing: parsed,
    itemsConsidered: items.length,
    costUsd,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

async function upsertBriefing(
  date: string,
  intro: string,
  briefing: BriefingPayload,
) {
  await db.execute(sql`
    INSERT INTO daily_briefings (date, hyewon_intro, sections_json, generated_at)
    VALUES (${date}::date, ${intro}, ${JSON.stringify(briefing.sections)}::jsonb, now())
    ON CONFLICT (date) DO UPDATE SET
      hyewon_intro = EXCLUDED.hyewon_intro,
      sections_json = EXCLUDED.sections_json,
      generated_at = now()
  `);
  void dailyBriefings;
}

function parseBriefing(text: string): BriefingPayload {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { intro: text.slice(0, 500), sections: [] };
  }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (typeof obj !== "object" || obj === null) {
      return { intro: text.slice(0, 500), sections: [] };
    }
    const intro = typeof obj.intro === "string" ? obj.intro : "";
    const sections = Array.isArray(obj.sections)
      ? obj.sections
          .filter((s: unknown): s is { category: string; items: unknown } => {
            if (typeof s !== "object" || s === null) return false;
            return typeof (s as { category?: unknown }).category === "string";
          })
          .map((s: { category: string; items: unknown }) => ({
            category: s.category,
            items: Array.isArray(s.items)
              ? (s.items as unknown[])
                  .filter(
                    (i: unknown): i is { title: string; url: string } => {
                      if (typeof i !== "object" || i === null) return false;
                      const ii = i as { title?: unknown; url?: unknown };
                      return (
                        typeof ii.title === "string" && typeof ii.url === "string"
                      );
                    },
                  )
                  .map((i: { title: string; url: string; marker?: unknown }) => ({
                    title: i.title,
                    url: i.url,
                    marker:
                      typeof i.marker === "string" && i.marker.length > 0
                        ? i.marker
                        : null,
                  }))
              : [],
          }))
      : [];
    return { intro, sections };
  } catch {
    return { intro: text.slice(0, 500), sections: [] };
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function trim(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export const BRIEFING_META = {
  model: BRIEFING_MODEL,
} as const;
