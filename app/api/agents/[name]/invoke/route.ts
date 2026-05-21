// 통일 Agent invoke 라우트 (v2 — 6명 에이전트).
// POST /api/agents/[name]/invoke
// body: { message: string, trigger?: string }
//
// 두 응답 모드:
//   - 기본 JSON: 전체 응답 1번에 반환. 내부 호출(ask_agent), 백그라운드 작업용.
//   - SSE (Accept: text/event-stream): 토큰 단위로 스트리밍. UI 채팅용.
//     이벤트 — iteration / delta / tool_call / tool_result / done / error
//
// 흐름:
// 1. agents 테이블에서 englishName으로 agent config 조회
// 2. lib/agents/guard.ts checkBeforeInvoke (활성/비용 한도)
// 3. tool defs는 agent별 매핑 + ask_agent (call_agents 권한 있으면 동적 추가)
// 4. lib/anthropic/client.ts invokeAgent / streamAgent — prompt caching 적용
// 5. tool_use 발생 시 max_iterations=5 루프 (동일 도구·동일 인자 2회면 중단)
// 6. agent_logs.insert (input/output tokens, cost, duration, error)
// 7. checkAfterInvoke (5연속 오류 시 자동 일시정지)

import { NextResponse, type NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db/client";
import { agents, agentLogs, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  invokeAgent,
  streamAgent,
  type AgentTool,
} from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";
import { checkAfterInvoke, checkBeforeInvoke } from "@/lib/agents/guard";
import { makeAskAgentTool, runAskAgent } from "@/lib/agents/tools/shared";
import { mainTools, runMainTool } from "@/lib/agents/tools/main";
import {
  assistantTools,
  runAssistantTool,
} from "@/lib/agents/tools/assistant";
import { dailyTools, runDailyTool } from "@/lib/agents/tools/daily";
import { diaryTools, runDiaryTool } from "@/lib/agents/tools/diary";
import { memoTools, runMemoTool } from "@/lib/agents/tools/memo";
import { calendarTools, runCalendarTool } from "@/lib/agents/tools/calendar";
import { rateLimit, rateLimitGc } from "@/lib/rate-limit";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ensureUser } from "@/lib/users/ensure";

const MAX_ITERATIONS = 5;
const MAX_AGENT_DEPTH = 2;
const DEPTH_HEADER = "x-myhub-agent-depth";
const INTERNAL_HEADER = "x-myhub-internal-call";
const USER_HEADER = "x-myhub-user-id";

type AgentRow = typeof agents.$inferSelect;
type ToolPerms = {
  data_read?: string[];
  data_write?: string[];
  external_apis?: string[];
  call_agents?: string[];
};
type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

function getAgentTools(
  englishName: string,
  permissions: ToolPerms,
  callerDepth: number,
  userId: string,
): {
  tools: AgentTool[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
} {
  let domainTools: AgentTool[] = [];
  let runDomainTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<ToolResult> = async () => ({
    ok: false,
    error: `agent ${englishName} has no domain tools`,
  });

  if (englishName === "main") {
    domainTools = mainTools;
    runDomainTool = (n, i) => runMainTool(n, userId, i);
  } else if (englishName === "assistant") {
    domainTools = assistantTools;
    runDomainTool = (n, i) => runAssistantTool(n, userId, i);
  } else if (englishName === "daily") {
    domainTools = dailyTools;
    runDomainTool = (n, i) => runDailyTool(n, userId, i);
  } else if (englishName === "diary") {
    domainTools = diaryTools;
    runDomainTool = (n, i) => runDiaryTool(n, userId, i);
  } else if (englishName === "memo") {
    domainTools = memoTools;
    runDomainTool = (n, i) => runMemoTool(n, userId, i);
  } else if (englishName === "calendar") {
    domainTools = calendarTools;
    runDomainTool = (n, i) => runCalendarTool(n, userId, i);
  }

  const callAgents = permissions.call_agents ?? [];
  const askTool = makeAskAgentTool(callAgents);

  const tools: AgentTool[] = askTool ? [...domainTools, askTool] : domainTools;

  const runTool = async (
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> => {
    if (name === "ask_agent") {
      return await runAskAgent(englishName, callerDepth, userId, input);
    }
    return await runDomainTool(name, input);
  };

  return { tools, runTool };
}

function renderSystemPrompt(template: string, userName: string): string {
  const now = new Date();
  return template
    .replace(/\{user_name\}/g, userName)
    .replace(
      /\{current_time\}/g,
      now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    );
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function logAgentResult(
  agentId: string,
  trigger: string,
  totalUsage: Usage,
  durationMs: number,
  costUsd: number,
  isError: boolean,
  errorMessage: string | null,
): Promise<string | undefined> {
  const [logRow] = await db
    .insert(agentLogs)
    .values({
      agentId,
      trigger,
      inputTokens: totalUsage.input_tokens,
      outputTokens: totalUsage.output_tokens,
      durationMs,
      costUsd: costUsd.toFixed(6),
      isError,
      errorMessage,
    })
    .returning({ id: agentLogs.id });
  await checkAfterInvoke(agentId);
  return logRow?.id;
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const isInternal = request.headers.get(INTERNAL_HEADER) === "1";
  if (isInternal) {
    const headerUserId = request.headers.get(USER_HEADER);
    if (headerUserId) return headerUserId;
    // 내부 호출인데 user-id 헤더가 없으면 단일 사용자 fallback — DB에서 첫 user.
    const [row] = await db.select({ id: users.id }).from(users).limit(1);
    return row?.id ?? null;
  }
  // 외부 호출 — supabase 세션에서 사용자 식별
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* read-only context */
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return await ensureUser(user);
}

// ───────────────────────────────────────────────────────────
// JSON 모드
// ───────────────────────────────────────────────────────────
async function runJsonMode(opts: {
  agent: AgentRow;
  systemPrompt: string;
  tools: AgentTool[];
  runTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<ToolResult>;
  userMessage: string;
  trigger: string;
}): Promise<NextResponse> {
  const { agent, systemPrompt, tools, runTool, userMessage, trigger } = opts;
  const startedAt = Date.now();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const totalUsage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let iterations = 0;
  let lastResponse: Anthropic.Message | null = null;
  let isError = false;
  let errorMessage: string | null = null;
  const seenToolCalls = new Set<string>();

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations += 1;
      const response = await invokeAgent({
        model: agent.model,
        systemPrompt,
        maxTokens: agent.maxTokens,
        temperature: agent.temperature ? parseFloat(agent.temperature) : undefined,
        messages,
        tools,
        cacheSystemAndTools: true,
      });
      lastResponse = response;

      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;
      totalUsage.cache_creation_input_tokens +=
        response.usage.cache_creation_input_tokens ?? 0;
      totalUsage.cache_read_input_tokens +=
        response.usage.cache_read_input_tokens ?? 0;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

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
    console.error(`[agent:${agent.englishName}] invoke failed:`, errorMessage);
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = lastResponse ? calculateCostUsd(agent.model, totalUsage) : 0;
  const agentLogId = await logAgentResult(
    agent.id,
    trigger,
    totalUsage,
    durationMs,
    costUsd,
    isError,
    errorMessage,
  );

  const text = lastResponse ? extractText(lastResponse.content) : "";

  if (isError) {
    return NextResponse.json(
      { error: errorMessage, agentLogId, iterations, durationMs },
      { status: 500 },
    );
  }

  return NextResponse.json({
    text,
    agentLogId,
    iterations,
    durationMs,
    costUsd,
    usage: totalUsage,
  });
}

// ───────────────────────────────────────────────────────────
// SSE 모드 (UI 채팅용)
// ───────────────────────────────────────────────────────────
function runSseMode(opts: {
  agent: AgentRow;
  systemPrompt: string;
  tools: AgentTool[];
  runTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<ToolResult>;
  userMessage: string;
  trigger: string;
}): Response {
  const { agent, systemPrompt, tools, runTool, userMessage, trigger } = opts;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      const startedAt = Date.now();
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
      ];
      const totalUsage: Usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };
      let iterations = 0;
      let lastFinal: Anthropic.Message | null = null;
      const seenToolCalls = new Set<string>();
      let isError = false;
      let errorMessage: string | null = null;

      try {
        while (iterations < MAX_ITERATIONS) {
          iterations += 1;
          emit("iteration", { n: iterations });

          const ms = await streamAgent({
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

          for await (const event of ms) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              emit("delta", { text: event.delta.text });
            }
          }

          const final = await ms.finalMessage();
          lastFinal = final;
          totalUsage.input_tokens += final.usage.input_tokens;
          totalUsage.output_tokens += final.usage.output_tokens;
          totalUsage.cache_creation_input_tokens +=
            final.usage.cache_creation_input_tokens ?? 0;
          totalUsage.cache_read_input_tokens +=
            final.usage.cache_read_input_tokens ?? 0;

          const toolUseBlocks = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          if (final.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
            break;
          }

          messages.push({ role: "assistant", content: final.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUseBlocks) {
            emit("tool_call", { id: tu.id, name: tu.name, input: tu.input });

            const sig = `${tu.name}:${JSON.stringify(tu.input)}`;
            if (seenToolCalls.has(sig)) {
              const errMsg =
                "ERROR: 동일한 인자로 같은 도구를 두 번 이상 호출했습니다. 다른 접근을 시도하세요.";
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: errMsg,
                is_error: true,
              });
              emit("tool_result", { id: tu.id, ok: false, error: errMsg });
              continue;
            }
            seenToolCalls.add(sig);

            const out = await runTool(
              tu.name,
              tu.input as Record<string, unknown>,
            );
            if (out.ok) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(out.result),
              });
              emit("tool_result", { id: tu.id, ok: true, result: out.result });
            } else {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: out.error,
                is_error: true,
              });
              emit("tool_result", { id: tu.id, ok: false, error: out.error });
            }
          }

          messages.push({ role: "user", content: toolResults });
        }
      } catch (e) {
        isError = true;
        errorMessage = e instanceof Error ? e.message : String(e);
        console.error(
          `[agent:${agent.englishName}] stream failed:`,
          errorMessage,
        );
        emit("error", { message: errorMessage });
      }

      const durationMs = Date.now() - startedAt;
      const costUsd = lastFinal ? calculateCostUsd(agent.model, totalUsage) : 0;
      const fullText = lastFinal ? extractText(lastFinal.content) : "";

      try {
        const agentLogId = await logAgentResult(
          agent.id,
          trigger,
          totalUsage,
          durationMs,
          costUsd,
          isError,
          errorMessage,
        );
        emit("done", {
          fullText,
          agentLogId,
          iterations,
          durationMs,
          costUsd,
          usage: totalUsage,
          isError,
        });
      } catch (e) {
        console.error("agent_logs insert failed:", e);
        emit("done", {
          fullText,
          iterations,
          durationMs,
          costUsd,
          usage: totalUsage,
          isError,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ───────────────────────────────────────────────────────────
// Route handler
// ───────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const depthHeader = request.headers.get(DEPTH_HEADER);
  const depth = depthHeader ? parseInt(depthHeader, 10) : 0;
  if (depth > MAX_AGENT_DEPTH) {
    return NextResponse.json(
      { error: "max_agent_depth_exceeded", depth },
      { status: 400 },
    );
  }

  const isInternal = request.headers.get(INTERNAL_HEADER) === "1";
  if (!isInternal) {
    rateLimitGc();
    const limit = rateLimit("agent-invoke", name, {
      perMin: 30,
      perHour: 200,
    });
    if (!limit.ok) {
      return NextResponse.json(
        {
          error: "rate_limited",
          window: limit.window,
          retryAfterMs: limit.retryAfterMs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        },
      );
    }
  }

  let body: { message?: string; trigger?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 },
    );
  }
  const trigger = body.trigger ?? "manual";

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "user_not_found" }, { status: 401 });
  }

  const [agent] = (await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, name))
    .limit(1)) as AgentRow[];
  if (!agent) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  const guard = await checkBeforeInvoke(agent.id);
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.status },
    );
  }

  const { tools, runTool } = getAgentTools(
    name,
    (agent.toolPermissions as ToolPerms) ?? {},
    depth,
    userId,
  );

  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const systemPrompt = renderSystemPrompt(
    agent.systemPrompt,
    user?.name ?? "사용자",
  );

  const wantsSse =
    request.headers.get("accept")?.includes("text/event-stream") ?? false;

  if (wantsSse) {
    return runSseMode({
      agent,
      systemPrompt,
      tools,
      runTool,
      userMessage,
      trigger,
    });
  }

  return await runJsonMode({
    agent,
    systemPrompt,
    tools,
    runTool,
    userMessage,
    trigger,
  });
}
