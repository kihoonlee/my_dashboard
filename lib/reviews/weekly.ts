// 주간 회고 자동 생성 — 수민(Sonnet 4.6).
// 입력: 한 주(월요일 시작)의 todos 완료 / habits 완료율 / GitHub 커밋 수 / 옵시디언 노트 신규 수.
// 출력: ai_summary (한 단락) + ai_suggestions (배열 1-3개 행동).
//
// 비용: Sonnet 4.6 1회. ~$0.01-0.03.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { db } from "@/lib/db/client";
import {
  agents,
  agentLogs,
  githubActivity,
  habitLogs,
  habits,
  obsidianNotes,
  todos,
  weeklyReviews,
} from "@/lib/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { tsTz } from "@/lib/db/sql-utils";

const REVIEW_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `당신은 따뜻하지만 단호한 목표 코치 수민입니다. 한 주의 활동 데이터를 받아 회고를 작성합니다.

원칙:
- 칭찬은 구체적인 사실 인용 (숫자/완료한 항목명).
- 지적은 부드럽되 직설. "X를 하지 않았다" → "X에 시간을 못 썼다"가 아닌 "X는 다음 주에 한 번에 끝낼 수 있을 것 같아요"식.
- 한 주의 한 가지 핵심 패턴만 짚을 것.

응답은 반드시 다음 JSON 형식만:
{
  "summary": "이번 주 회고 한 단락 (3-5문장, 한국어)",
  "suggestions": ["다음 주 시도할 작은 행동 1", "...2"]
}

JSON 외 텍스트 금지.`;

export type WeeklyReviewResult = {
  weekStart: string;
  todosCompleted: number;
  habitsCompletionRate: number;
  githubCommits: number;
  obsidianNotesCreated: number;
  aiSummary: string;
  aiSuggestions: string[];
  costUsd: number;
};

/**
 * weekStart는 그 주 월요일(YYYY-MM-DD). 미지정 시 이번 주 월요일.
 */
export async function generateWeeklyReview(
  weekStart?: string,
): Promise<WeeklyReviewResult> {
  const start = weekStart ? new Date(weekStart) : startOfThisWeek();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekStartIso = isoDate(start);

  // ── 집계 ──
  const todosDone = await db.execute<{ cnt: number; titles: string[] }>(sql`
    SELECT
      COUNT(*)::int AS cnt,
      ARRAY_AGG(title ORDER BY completed_at DESC) FILTER (WHERE title IS NOT NULL) AS titles
    FROM ${todos}
    WHERE status = 'done'
      AND completed_at >= ${tsTz(start)}
      AND completed_at < ${tsTz(end)}
  `);
  const todosCompleted = (todosDone[0] as unknown as { cnt: number })?.cnt ?? 0;
  const completedTitles =
    (todosDone[0] as unknown as { titles: string[] | null })?.titles ?? [];

  // habits — 그 주 동안의 logs 중 completed=true 비율
  const habitRow = await db.execute<{
    log_count: number;
    done_count: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS log_count,
      COUNT(*) FILTER (WHERE l.completed = true)::int AS done_count
    FROM ${habitLogs} l
    JOIN ${habits} h ON h.id = l.habit_id AND h.archived = false
    WHERE l.date >= ${isoDate(start)}::date
      AND l.date < ${isoDate(end)}::date
  `);
  const logCount =
    (habitRow[0] as unknown as { log_count: number })?.log_count ?? 0;
  const doneCount =
    (habitRow[0] as unknown as { done_count: number })?.done_count ?? 0;
  const habitsCompletionRate = logCount > 0 ? doneCount / logCount : 0;

  // github commits
  const ghRow = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(githubActivity)
    .where(
      and(
        eq(githubActivity.type, "commit"),
        gte(githubActivity.createdAt, start),
        lt(githubActivity.createdAt, end),
      ),
    );
  const githubCommits = ghRow[0]?.cnt ?? 0;

  // obsidian notes
  const obRow = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(obsidianNotes)
    .where(
      and(
        gte(obsidianNotes.lastModified, start),
        lt(obsidianNotes.lastModified, end),
      ),
    );
  const obsidianNotesCreated = obRow[0]?.cnt ?? 0;

  // ── LLM ──
  const lines: string[] = [
    `주간 회고 데이터 (${weekStartIso} ~ ${isoDate(addDays(start, 6))})`,
    "",
    `완료한 Todo: ${todosCompleted}건`,
    ...(completedTitles.slice(0, 10).map((t) => `  - ${t}`) ?? []),
    `습관 완료율: ${(habitsCompletionRate * 100).toFixed(0)}% (${doneCount}/${logCount})`,
    `GitHub 커밋: ${githubCommits}건`,
    `옵시디언 노트 변경: ${obsidianNotesCreated}건`,
  ];

  const res = await invokeAgent({
    model: REVIEW_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1500,
    temperature: 0.5,
    messages: [{ role: "user", content: lines.join("\n") }],
    cacheSystemAndTools: true,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = parseReview(text);
  const usage = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  };
  const costUsd = calculateCostUsd(REVIEW_MODEL, usage);

  // upsert
  await db
    .insert(weeklyReviews)
    .values({
      weekStart: weekStartIso,
      todosCompleted,
      habitsCompletionRate: habitsCompletionRate.toFixed(2),
      githubCommits,
      obsidianNotesCreated,
      aiSummary: parsed.summary,
      aiSuggestions: parsed.suggestions,
    })
    .onConflictDoUpdate({
      target: weeklyReviews.weekStart,
      set: {
        todosCompleted,
        habitsCompletionRate: habitsCompletionRate.toFixed(2),
        githubCommits,
        obsidianNotesCreated,
        aiSummary: parsed.summary,
        aiSuggestions: parsed.suggestions,
      },
    });

  // agent_logs
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "soomin"))
      .limit(1);
    if (a?.id) {
      await db.insert(agentLogs).values({
        agentId: a.id,
        trigger: "weekly_review",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        durationMs: 0,
        costUsd: costUsd.toFixed(6),
        isError: false,
        errorMessage: null,
      });
    }
  } catch (e) {
    console.error("[reviews/weekly] agent_logs insert failed:", e);
  }

  return {
    weekStart: weekStartIso,
    todosCompleted,
    habitsCompletionRate,
    githubCommits,
    obsidianNotesCreated,
    aiSummary: parsed.summary,
    aiSuggestions: parsed.suggestions,
    costUsd,
  };
}

function parseReview(text: string): { summary: string; suggestions: string[] } {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { summary: text.slice(0, 800), suggestions: [] };
  }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (typeof obj !== "object" || obj === null) {
      return { summary: text.slice(0, 800), suggestions: [] };
    }
    const summary = typeof obj.summary === "string" ? obj.summary : "";
    const suggestions = Array.isArray(obj.suggestions)
      ? obj.suggestions.filter((s: unknown): s is string => typeof s === "string")
      : [];
    return { summary, suggestions };
  } catch {
    return { summary: text.slice(0, 800), suggestions: [] };
  }
}

// 그 주 월요일 (Asia/Seoul 기준 — toLocaleString 안 쓰고 단순 산술)
function startOfThisWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diff = (day + 6) % 7; // Mon-relative (Mon=0)
  d.setDate(d.getDate() - diff);
  return d;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const REVIEW_META = {
  model: REVIEW_MODEL,
} as const;
