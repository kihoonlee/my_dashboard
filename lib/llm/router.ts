// Multi-provider LLM router.
// 모델 ID prefix로 provider 판별 → Anthropic 또는 Gemini 어댑터 dispatch.
// **Anthropic.Message 타입을 lingua franca로** 유지 — 호출자(route.ts 등) 무수정.
//
// claude-* → Anthropic SDK
// gemini-* → @google/genai (어댑터가 Anthropic.Message로 정규화)

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  invokeAnthropic,
  streamAnthropic,
} from "@/lib/llm/anthropic-impl";
import {
  invokeGemini,
  streamGemini,
} from "@/lib/llm/gemini-impl";

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

export type InvokeAgentParams = {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature?: number;
  messages: Anthropic.MessageParam[];
  tools?: AgentTool[];
  /** 시스템 프롬프트 + tool defs 캐시 — Anthropic ephemeral, Gemini는 implicit (무시 OK) */
  cacheSystemAndTools?: boolean;
};

/**
 * route.ts 호환 streaming 인터페이스. AsyncIterable<RawMessageStreamEvent> + finalMessage().
 * - 실제 Anthropic 모델은 SDK의 MessageStream 그대로 반환
 * - Gemini 모델은 GeminiMessageStreamAdapter (lib/llm/gemini-stream.ts)
 */
export type StreamHandle = AsyncIterable<Anthropic.RawMessageStreamEvent> & {
  finalMessage: () => Promise<Anthropic.Message>;
};

export function getProvider(modelId: string): "anthropic" | "gemini" {
  if (modelId.startsWith("gemini-")) return "gemini";
  return "anthropic";
}

/**
 * Single-turn invoke. 반환은 Anthropic.Message 형태로 정규화.
 * Gemini 모델인 경우 어댑터가 Gemini 응답 → Anthropic.Message 변환.
 */
export async function invokeAgent(
  params: InvokeAgentParams,
): Promise<Anthropic.Message> {
  return getProvider(params.model) === "gemini"
    ? await invokeGemini(params)
    : await invokeAnthropic(params);
}

/**
 * Streaming invoke. 반환은 AsyncIterable<RawMessageStreamEvent> + finalMessage() 인터페이스.
 * route.ts:341의 `for await (const event of ms)` + `await ms.finalMessage()` 패턴 그대로 동작.
 */
export async function streamAgent(
  params: InvokeAgentParams,
): Promise<StreamHandle> {
  return getProvider(params.model) === "gemini"
    ? await streamGemini(params)
    : await streamAnthropic(params);
}
