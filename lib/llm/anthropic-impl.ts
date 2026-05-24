// Anthropic 구현체 — 기존 lib/anthropic/client.ts의 본문을 이전.
// 외부 인터페이스(invokeAgent/streamAgent)는 lib/llm/router.ts에서 dispatch.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { resolveApiKey } from "@/lib/secrets/resolver";
import type { AgentTool, InvokeAgentParams, StreamHandle } from "@/lib/llm/router";

/**
 * Anthropic 클라이언트 — 매 호출마다 생성 (키 회전 즉시 반영, SDK 객체 lightweight).
 * 키 해소 우선순위: api_keys 테이블 → process.env / .env.local → throw.
 */
export async function getAnthropicClient(): Promise<Anthropic> {
  const apiKey = await resolveApiKey("anthropic");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not available. Set it in /settings or .env.local.",
    );
  }
  return new Anthropic({ apiKey });
}

function buildSystem(
  systemPrompt: string,
  cache: boolean,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: systemPrompt,
      ...(cache ? { cache_control: { type: "ephemeral" } } : {}),
    },
  ];
}

function buildTools(
  tools: AgentTool[] | undefined,
  cache: boolean,
): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t, i) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    ...(cache && i === tools.length - 1
      ? { cache_control: { type: "ephemeral" as const } }
      : {}),
  }));
}

export async function invokeAnthropic(
  params: InvokeAgentParams,
): Promise<Anthropic.Message> {
  const anthropic = await getAnthropicClient();
  const cache = !!params.cacheSystemAndTools;
  const system = buildSystem(params.systemPrompt, cache);
  const tools = buildTools(params.tools, cache);

  return await anthropic.messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    ...(typeof params.temperature === "number"
      ? { temperature: params.temperature }
      : {}),
    system,
    messages: params.messages,
    ...(tools ? { tools } : {}),
  });
}

export async function streamAnthropic(
  params: InvokeAgentParams,
): Promise<StreamHandle> {
  const anthropic = await getAnthropicClient();
  const cache = !!params.cacheSystemAndTools;
  const system = buildSystem(params.systemPrompt, cache);
  const tools = buildTools(params.tools, cache);

  // SDK의 MessageStream은 이미 AsyncIterable + finalMessage() 인터페이스를 가짐.
  return anthropic.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    ...(typeof params.temperature === "number"
      ? { temperature: params.temperature }
      : {}),
    system,
    messages: params.messages,
    ...(tools ? { tools } : {}),
  }) as unknown as StreamHandle;
}
