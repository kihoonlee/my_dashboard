// Anthropic SDK singleton + 모델 호출 헬퍼.
// claude-api skill 가이드 준수:
// - prompt caching (시스템 프롬프트 + tool defs 캐시)
// - 모델 ID는 시드 (definitions.ts)에서 그대로 사용 — `claude-sonnet-4-6` / `claude-haiku-4-5-...`
// - 4.6 이상은 streaming 권장 (max_tokens > ~16K), Phase 1 단계에서는 비-스트리밍 1024-tokens.

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set in environment (.env.local).",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * Tool definition (Anthropic Tool Use 표준 schema).
 * input_schema는 JSON Schema. agents 테이블의 tool_permissions에 따라 외부 노출 제어.
 */
export type AgentTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/**
 * Single-turn invoke. tool_use가 발생하면 raw response 그대로 반환 — 호출자(route handler)가
 * tool 실행 + 결과 messages append + 재호출 루프를 처리한다 (Phase 1에서는 max_iterations=5 캡).
 */
export async function invokeAgent(params: {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature?: number;
  messages: Anthropic.MessageParam[];
  tools?: AgentTool[];
  /** 시스템 프롬프트 + tool defs를 캐시 (5min TTL). 동일 agent 반복 호출 시 토큰 절약. */
  cacheSystemAndTools?: boolean;
}): Promise<Anthropic.Message> {
  const anthropic = getAnthropicClient();

  // 시스템 프롬프트 — caching 활성화 시 마지막 system block에 cache_control.
  // 시드의 systemPrompt는 단일 문자열이므로 단일 block으로 변환.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: params.systemPrompt,
      ...(params.cacheSystemAndTools
        ? { cache_control: { type: "ephemeral" } }
        : {}),
    },
  ];

  // Tools — caching 활성화 시 마지막 tool에 cache_control (tools가 system보다 먼저 렌더되므로
  // tools에 marker가 있으면 시스템도 함께 캐시됨).
  let tools: Anthropic.Tool[] | undefined;
  if (params.tools && params.tools.length > 0) {
    tools = params.tools.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      ...(params.cacheSystemAndTools && i === params.tools!.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    }));
  }

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
