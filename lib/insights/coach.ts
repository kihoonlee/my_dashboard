// 수민의 특정 습관 코칭 — Sonnet 4.6.
// 90일 컨텍스트 + 사용자가 적은 'struggle' (선택)을 받아 분석 + 작은 행동 제안.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { db } from "@/lib/db/client";
import { agents, agentLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { HabitLog } from "@/lib/habits/streak";
import { computeStreak, completionRate14d } from "@/lib/habits/streak";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `당신은 따뜻하지만 단호한 목표 코치 수민입니다. 한 가지 습관에 대해 사용자가 막혔거나 패턴을 짚어주길 원할 때 호출됩니다.

[원칙]
- 패턴 인식: 90일 데이터에서 시작이 좋다가 떨어졌는지, 주말에만 무너지는지, 특정 시점에 반복되는지 짚기.
- 작은 행동 제안 1-2개: '내일 1분만' 같은 진입장벽 낮추기.
- 사용자에게 던지는 질문 1개: 막힌 진짜 이유 자각.
- 비난 금지. 지적은 부드럽게.

응답 형식 (한국어, 평문, 최대 500자):
1. 패턴 한 문장 ("최근 7일 중 3일은 주말 — 평일은 잘 지키시는 편")
2. 추천 액션 1-2개 ("내일은 평소 시간 30분 앞당겨, 1분만이라도 시작")
3. 사용자 질문 1개 ("이 습관이 왜 시작됐는지 한 줄로 적어볼 수 있을까요?")

JSON 아님. 평문 한국어.`;

export type CoachInput = {
  habitName: string;
  habitDescription?: string | null;
  logs: HabitLog[]; // 90일 윈도우
  userStruggle?: string | null;
};

export type CoachResult = {
  text: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export async function coachHabit(input: CoachInput): Promise<CoachResult> {
  const startedAt = Date.now();
  const streak = computeStreak(input.logs);
  const rate = completionRate14d(input.logs);

  // 최근 14일 패턴 압축 (✓ / X / .)
  const recent14 = input.logs
    .slice(-14)
    .map((l) =>
      l.completed === true ? "✓" : l.completed === false ? "X" : ".",
    )
    .join("");

  // 주말 vs 평일
  const weekdayStats = { logged: 0, completed: 0 };
  const weekendStats = { logged: 0, completed: 0 };
  for (const log of input.logs) {
    const d = new Date(log.date);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    const target = dow === 0 || dow === 6 ? weekendStats : weekdayStats;
    target.logged += 1;
    if (log.completed) target.completed += 1;
  }

  const lines: string[] = [
    `습관: ${input.habitName}`,
    input.habitDescription ? `설명: ${input.habitDescription}` : null,
    `현재 스트릭: ${streak.current}일 (최장 ${streak.longest}일)`,
    `최근 14일 완료율: ${Math.round(rate.rate * 100)}% (${rate.completed}/${rate.logged})`,
    `최근 14일 패턴: ${recent14}  (✓=완료, X=미완료, .=기록 없음)`,
    weekdayStats.logged > 0
      ? `평일 완료율: ${Math.round((weekdayStats.completed / weekdayStats.logged) * 100)}% (${weekdayStats.completed}/${weekdayStats.logged})`
      : null,
    weekendStats.logged > 0
      ? `주말 완료율: ${Math.round((weekendStats.completed / weekendStats.logged) * 100)}% (${weekendStats.completed}/${weekendStats.logged})`
      : null,
    input.userStruggle ? `사용자 메모: ${input.userStruggle}` : null,
  ].filter(Boolean) as string[];

  const userMessage = lines.join("\n");

  const res = await invokeAgent({
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1500,
    temperature: 0.5,
    messages: [{ role: "user", content: userMessage }],
    cacheSystemAndTools: true,
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const usage = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  };
  const costUsd = calculateCostUsd(MODEL, usage);
  const durationMs = Date.now() - startedAt;

  // agent_logs 기록
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "soomin"))
      .limit(1);
    if (a?.id) {
      await db.insert(agentLogs).values({
        agentId: a.id,
        trigger: "habit_coach",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        durationMs,
        costUsd: costUsd.toFixed(6),
        isError: false,
        errorMessage: null,
      });
    }
  } catch (e) {
    console.error("[insights/coach] agent_logs insert failed:", e);
  }

  return {
    text: text || "(빈 응답)",
    costUsd,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    durationMs,
  };
}

export const COACH_META = { model: MODEL } as const;
