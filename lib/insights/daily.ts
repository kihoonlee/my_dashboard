// 수민의 데일리 모티베이션 메시지 생성.
// Haiku 4.5 + JSON 응답 + prompt caching. 컨텍스트는 매우 짧게(~500 tokens).

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { db } from "@/lib/db/client";
import { agents, agentLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `당신은 따뜻하지만 단호한 목표 코치 수민입니다. 사용자에게 매일 한 문장 인사이트를 줍니다.

[원칙]
- 한 문장. 한국어. 25자 이내.
- 4가지 톤 중 컨텍스트에 맞게 1택:
  * 격려: "잘하고 있어, 오늘도 한 칸"
  * 통찰: "잘되는 패턴은 X였다"
  * 행동 권유: "오늘은 작은 한 걸음만"
  * 질문: "지금 진짜 중요한 건?"
- 클리셰 금지 ("화이팅!", "오늘도 파이팅!" 등 금지)
- 사용자가 부진한 습관(완료율 50% 미만)이 있으면 그것에 부드럽게 초점

응답은 JSON만:
{"insight": "한 문장", "focusHabit": "습관명 또는 null", "tone": "encourage|insight|action|question"}

JSON 외 텍스트 금지.`;

export type InsightContext = {
  habits: Array<{ name: string; rate14d: number; loggedDays: number }>;
  pendingTodos: number;
  hasWeeklyReview: boolean;
};

export type InsightResult = {
  insight: string;
  focusHabit: string | null;
  tone: "encourage" | "insight" | "action" | "question";
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  generatedAt: string;
};

export async function generateDailyInsight(
  ctx: InsightContext,
): Promise<InsightResult> {
  const lines: string[] = [];
  if (ctx.habits.length === 0) {
    lines.push("활성 습관: 없음");
  } else {
    lines.push(`활성 습관 (${ctx.habits.length}개):`);
    for (const h of ctx.habits) {
      const pct = Math.round(h.rate14d * 100);
      const note =
        h.loggedDays === 0
          ? "기록 없음"
          : h.rate14d < 0.5 && h.loggedDays >= 5
            ? `14d ${pct}% — 부진`
            : `14d ${pct}%`;
      lines.push(`- ${h.name} (${note})`);
    }
  }
  lines.push(`오늘 미완료 todo: ${ctx.pendingTodos}건`);
  if (ctx.hasWeeklyReview) lines.push("이번 주 회고: 있음");
  else lines.push("이번 주 회고: 없음");

  const userMessage = lines.join("\n");

  const res = await invokeAgent({
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 300,
    temperature: 0.7,
    messages: [{ role: "user", content: userMessage }],
    cacheSystemAndTools: true,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJson(text);
  const usage = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  };
  const costUsd = calculateCostUsd(MODEL, usage);

  // agent_logs 기록 (수민)
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "soomin"))
      .limit(1);
    if (a?.id) {
      await db.insert(agentLogs).values({
        agentId: a.id,
        trigger: "daily_insight",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        durationMs: 0,
        costUsd: costUsd.toFixed(6),
        isError: false,
        errorMessage: null,
      });
    }
  } catch (e) {
    console.error("[insights/daily] agent_logs insert failed:", e);
  }

  return {
    insight: parsed.insight,
    focusHabit: parsed.focusHabit,
    tone: parsed.tone,
    costUsd,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    generatedAt: new Date().toISOString(),
  };
}

function parseJson(text: string): {
  insight: string;
  focusHabit: string | null;
  tone: "encourage" | "insight" | "action" | "question";
} {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { insight: text.slice(0, 80), focusHabit: null, tone: "encourage" };
  }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const tone = ["encourage", "insight", "action", "question"].includes(obj.tone)
      ? obj.tone
      : "encourage";
    return {
      insight: typeof obj.insight === "string" ? obj.insight.trim() : "",
      focusHabit:
        typeof obj.focusHabit === "string" && obj.focusHabit.length > 0
          ? obj.focusHabit
          : null,
      tone,
    };
  } catch {
    return { insight: text.slice(0, 80), focusHabit: null, tone: "encourage" };
  }
}

export const INSIGHT_META = { model: MODEL } as const;
