// 토론 runner — 메인 에이전트가 main.start_discussion 도구를 호출하면 여기서 처리.
//
// 흐름:
//   1) discussions row insert (status=running, summary_md=null)
//   2) 즉시 discussionId 반환 — 사용자에게는 메인이 "시작했어요, 끝나면 알림 갈게요"
//   3) 백그라운드 (Promise를 await하지 않음)에서 무한 라운드 루프:
//      - 각 라운드: 타겟 에이전트에게 ask_agent 호출, 답변 discussion_turns insert
//      - 메인이 모든 의견 종합 → is_resolved 판단 → resolved면 break
//      - 8라운드 또는 토큰 예산 초과 시 강제 종료
//   4) 완료 시 discussions.summary_md update + status=done + send_notification.
//      실패 시 status=failed + summary에 에러 사유.
//
// 주의: Next.js serverless 환경에서는 응답 후 background 작업이 잘릴 수 있다.
// dev (단일 사용자 Mac local server, 24/7 launchctl) 환경에서는 안전.
// production 전환 시 background queue 도입 필요.

import "server-only";
import { db } from "@/lib/db/client";
import { agents, discussions, discussionTurns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { invokeAgent } from "@/lib/anthropic/client";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { calculateCostUsd } from "@/lib/anthropic/pricing";

const MAX_ROUNDS = 8;
const DEFAULT_BUDGET = 0.5; // USD

export type StartDiscussionInput = {
  userId: string;
  topic: string;
  targetAgents: string[];
};

export async function startDiscussion(
  input: StartDiscussionInput,
): Promise<string> {
  const [row] = await db
    .insert(discussions)
    .values({
      userId: input.userId,
      topic: input.topic,
      targetAgents: input.targetAgents,
      status: "running",
    })
    .returning({ id: discussions.id });

  // 백그라운드 실행. 응답에는 영향 없음.
  // queueMicrotask 대신 직접 호출 — 에러는 row.status로 surface.
  void runDiscussionLoop(row.id).catch(async (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(discussions)
      .set({
        status: "failed",
        summaryMd: `토론 실행 중 오류: ${msg}`,
        completedAt: new Date(),
      })
      .where(eq(discussions.id, row.id));
  });

  return row.id;
}

async function runDiscussionLoop(discussionId: string): Promise<void> {
  const [d] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, discussionId))
    .limit(1);
  if (!d) throw new Error(`discussion ${discussionId} not found`);

  const budgetUsd = parseFloat(d.tokenBudgetUsd) || DEFAULT_BUDGET;
  let totalCost = 0;
  let summary = "";

  // 메인 에이전트(진행자) 정보
  const [mainAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, "main"))
    .limit(1);
  if (!mainAgent) throw new Error("main agent not found");

  const targetAgents = (d.targetAgents as string[]) || [];
  if (targetAgents.length === 0) {
    summary = "참여 에이전트가 지정되지 않음.";
    await finalize(discussionId, "failed", summary, totalCost, 0);
    return;
  }

  const targetAgentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, targetAgents[0])); // dummy: 아래에서 loop
  void targetAgentRows;

  let round = 0;
  let lastSynthesis = "";
  for (round = 1; round <= MAX_ROUNDS; round++) {
    if (totalCost >= budgetUsd) {
      summary = `예산($${budgetUsd}) 초과로 라운드 ${round - 1}에서 중단.\n\n${lastSynthesis}`;
      await finalize(discussionId, "failed", summary, totalCost, round - 1);
      return;
    }

    // 라운드 N에서 각 타겟 에이전트에게 의견 요청
    const turnInputs: Array<{ speakerEnglishName: string; content: string }> =
      [];
    for (const targetName of targetAgents) {
      const prompt = buildTargetPrompt({
        topic: d.topic,
        round,
        previousSynthesis: lastSynthesis,
      });
      const [target] = await db
        .select()
        .from(agents)
        .where(eq(agents.englishName, targetName))
        .limit(1);
      if (!target || !target.isActive) continue;

      const result = await invokeAgent({
        model: target.model,
        systemPrompt: target.systemPrompt
          .replace("{user_name}", "사용자")
          .replace("{current_time}", new Date().toISOString()),
        maxTokens: 1024,
        temperature: parseFloat(target.temperature ?? "0.4"),
        messages: [{ role: "user", content: prompt }],
        cacheSystemAndTools: true,
      });

      const text = extractText(result);
      turnInputs.push({ speakerEnglishName: targetName, content: text });
      totalCost += calculateCostUsd(target.model, result.usage);
    }

    // turns insert
    for (const t of turnInputs) {
      const [a] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.englishName, t.speakerEnglishName))
        .limit(1);
      if (!a) continue;
      await db.insert(discussionTurns).values({
        discussionId,
        round,
        speakerAgentId: a.id,
        content: t.content,
      });
    }

    // 메인이 의견 종합 + 결론 도달 여부 판단
    const synthPrompt = buildSynthesisPrompt({
      topic: d.topic,
      round,
      opinions: turnInputs,
    });
    const synthResult = await invokeAgent({
      model: mainAgent.model,
      systemPrompt: `당신은 토론 진행자 "지원" 입니다. 의견을 종합하고 결론에 도달했는지 판단합니다.
응답 형식 — 반드시 다음 두 줄로 시작:
RESOLVED: yes | no
SUMMARY: <한국어 markdown으로 종합 요약. 결론, 핵심 합의점, 남은 이견을 명시>

RESOLVED=yes 조건: 모든 참여자의 핵심 의견이 일치했거나 사용자가 결정하면 되는 명확한 선택지 2-3개로 좁혀짐.
RESOLVED=no면 다음 라운드에서 다시 질문할 follow-up도 SUMMARY 끝에 "FOLLOWUP: ..." 한 줄로 명시.`,
      maxTokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: synthPrompt }],
      cacheSystemAndTools: false,
    });
    totalCost += calculateCostUsd(mainAgent.model, synthResult.usage);
    const synthText = extractText(synthResult);
    lastSynthesis = synthText;

    // 메인의 종합도 turn으로 기록
    await db.insert(discussionTurns).values({
      discussionId,
      round,
      speakerAgentId: mainAgent.id,
      content: synthText,
    });

    // RESOLVED 파싱
    const resolved = /^RESOLVED:\s*yes\b/im.test(synthText);
    if (resolved) {
      summary = synthText.replace(/^RESOLVED:.*\n?/im, "").trim();
      await finalize(discussionId, "done", summary, totalCost, round);
      // 알림 발송
      await dispatchNotification({
        userId: d.userId,
        kind: "discussion_result",
        title: `토론 결과: ${d.topic}`,
        bodyMd: summary.slice(0, 800),
        payload: { discussion_id: discussionId },
      });
      return;
    }
  }

  // 최대 라운드 도달
  summary = `최대 라운드(${MAX_ROUNDS})에 도달했습니다.\n\n${lastSynthesis}`;
  await finalize(discussionId, "done", summary, totalCost, MAX_ROUNDS);
  await dispatchNotification({
    userId: d.userId,
    kind: "discussion_result",
    title: `토론 종료(라운드 한도): ${d.topic}`,
    bodyMd: summary.slice(0, 800),
    payload: { discussion_id: discussionId },
  });
}

function buildTargetPrompt(args: {
  topic: string;
  round: number;
  previousSynthesis: string;
}): string {
  const prev = args.previousSynthesis
    ? `\n\n[이전 라운드 종합]\n${args.previousSynthesis.slice(0, 1200)}\n\n위 종합에 대한 본인 의견을 한 단락으로 답변. 동의/반대 명확히, 근거 1-2개, 추가 제안 1개.`
    : "";
  return `당신은 다중 에이전트 토론의 참여자입니다.\n\n[토론 주제]\n${args.topic}\n\n[라운드 ${args.round}]${prev || "\n\n당신의 관점에서 핵심 의견을 한 단락으로 답변. 근거 1-2개, 다른 참여자가 생각하지 못할 시각을 강조."}`;
}

function buildSynthesisPrompt(args: {
  topic: string;
  round: number;
  opinions: Array<{ speakerEnglishName: string; content: string }>;
}): string {
  const list = args.opinions
    .map(
      (o, i) =>
        `--- ${i + 1}. ${o.speakerEnglishName} ---\n${o.content.slice(0, 1500)}`,
    )
    .join("\n\n");
  return `[토론 주제]\n${args.topic}\n\n[라운드 ${args.round} 참여자 의견]\n${list}`;
}

function extractText(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  const blocks = result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  return blocks || "(응답 없음)";
}

async function finalize(
  discussionId: string,
  status: "done" | "failed",
  summary: string,
  totalCost: number,
  rounds: number,
) {
  await db
    .update(discussions)
    .set({
      status,
      summaryMd: summary,
      totalCostUsd: totalCost.toFixed(6),
      roundsRun: rounds,
      completedAt: new Date(),
    })
    .where(eq(discussions.id, discussionId));
}
