// 통일 Agent invoke 라우트.
// POST /api/agents/[name]/invoke
// body: { message: string, trigger?: string }
//
// 흐름:
// 1. agents 테이블에서 englishName으로 agent config 조회
// 2. lib/agents/guard.ts checkBeforeInvoke (활성/비용 한도)
// 3. tool defs는 agent별 매핑 (Phase 1: 하영만)
// 4. lib/anthropic/client.ts invokeAgent — prompt caching 적용
// 5. tool_use 발생 시 max_iterations=5 루프 (동일 도구·동일 인자 2회면 중단)
// 6. agent_logs.insert (input/output tokens, cost, duration, error)
// 7. checkAfterInvoke (5연속 오류 시 자동 일시정지)
// 8. 응답: { text, agentLogId, iterations, durationMs, costUsd }

import { NextResponse, type NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db/client";
import { agents, agentLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { invokeAgent, type AgentTool } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { checkAfterInvoke, checkBeforeInvoke } from "@/lib/agents/guard";
import { HAYOUNG_TOOLS, runHayoungTool } from "@/lib/agents/tools/hayoung";

const MAX_ITERATIONS = 5;

type AgentRow = typeof agents.$inferSelect;

/**
 * Agent englishName → tool definitions + tool runner 매핑.
 * Phase 1에서는 하영만. Phase 2+에서 혜원/민지/서연/다솜/현주/도연/민영/정연/수민 추가.
 */
function getAgentTools(englishName: string): {
  tools: AgentTool[];
  runTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
} {
  if (englishName === "hayoung") {
    return { tools: HAYOUNG_TOOLS, runTool: runHayoungTool };
  }
  return {
    tools: [],
    runTool: async () => ({
      ok: false,
      error: `agent ${englishName} has no tools registered yet`,
    }),
  };
}

/**
 * 시스템 프롬프트의 placeholder 치환. {user_name} / {current_time}.
 * Phase 0~1에서 user_name은 하드코딩 ('지훈'), Phase 2+에서 세션 user 연결.
 */
function renderSystemPrompt(template: string): string {
  const now = new Date();
  return template
    .replace(/\{user_name\}/g, "지훈")
    .replace(
      /\{current_time\}/g,
      now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const startedAt = Date.now();

  // 1. body 파싱
  let body: { message?: string; trigger?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }
  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 },
    );
  }
  const trigger = body.trigger ?? "manual";

  // 2. agent 조회
  const [agent] = (await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, name))
    .limit(1)) as AgentRow[];
  if (!agent) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  // 3. 가드 (활성 + 비용 한도)
  const guard = await checkBeforeInvoke(agent.id);
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.status },
    );
  }

  // 4. tool defs + runner
  const { tools, runTool } = getAgentTools(name);
  const systemPrompt = renderSystemPrompt(agent.systemPrompt);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let iterations = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreate = 0;
  let totalCacheRead = 0;
  let lastResponse: Anthropic.Message | null = null;
  let isError = false;
  let errorMessage: string | null = null;
  // 동일 도구 + 동일 인자 2회 호출 시 중단 (claude-api skill 권장 안티-루프)
  const seenToolCalls = new Set<string>();

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations += 1;
      const response = await invokeAgent({
        model: agent.model,
        systemPrompt,
        maxTokens: agent.maxTokens,
        temperature: agent.temperature
          ? parseFloat(agent.temperature)
          : undefined,
        messages,
        tools,
        cacheSystemAndTools: true,
      });
      lastResponse = response;

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCacheCreate += response.usage.cache_creation_input_tokens ?? 0;
      totalCacheRead += response.usage.cache_read_input_tokens ?? 0;

      // tool_use 블록 추출
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break; // 종료
      }

      // assistant turn 보관 (다음 user turn에서 tool_result 첨부)
      messages.push({ role: "assistant", content: response.content });

      // 각 tool 실행
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUseBlocks) {
        const sig = `${tu.name}:${JSON.stringify(tu.input)}`;
        if (seenToolCalls.has(sig)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content:
              "ERROR: 동일한 인자로 같은 도구를 두 번 이상 호출했습니다. 다른 접근을 시도하세요.",
            is_error: true,
          });
          continue;
        }
        seenToolCalls.add(sig);

        const out = await runTool(tu.name, tu.input as Record<string, unknown>);
        if (out.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out.result),
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: out.error,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  } catch (e) {
    isError = true;
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`[agent:${name}] invoke failed:`, errorMessage);
  }

  // 5. 비용 계산 + agent_logs.insert
  const durationMs = Date.now() - startedAt;
  const costUsd = lastResponse
    ? calculateCostUsd(agent.model, {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cache_creation_input_tokens: totalCacheCreate,
        cache_read_input_tokens: totalCacheRead,
      })
    : 0;

  const [logRow] = await db
    .insert(agentLogs)
    .values({
      agentId: agent.id,
      trigger,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      costUsd: costUsd.toFixed(6),
      isError,
      errorMessage,
    })
    .returning({ id: agentLogs.id });

  // 6. 5연속 오류 체크
  await checkAfterInvoke(agent.id);

  // 7. 응답 텍스트 추출
  const text = lastResponse
    ? lastResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
    : "";

  if (isError) {
    return NextResponse.json(
      {
        error: errorMessage,
        agentLogId: logRow?.id,
        iterations,
        durationMs,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    text,
    agentLogId: logRow?.id,
    iterations,
    durationMs,
    costUsd,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_creation_input_tokens: totalCacheCreate,
      cache_read_input_tokens: totalCacheRead,
    },
  });
}
