// Anthropic ↔ Gemini 양방향 변환 헬퍼.
// route.ts는 Anthropic.* 타입만 보고, gemini-impl이 이걸 통해 SDK 호출 입력을 만들고
// SDK 응답을 다시 Anthropic.Message로 정규화.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
  Part,
  Schema,
  Tool,
} from "@google/genai";
import type { AgentTool } from "@/lib/llm/router";

// ─────────────────────────────────────────────────────────
// Tool 정의: Anthropic → Gemini
// ─────────────────────────────────────────────────────────

/**
 * AgentTool[] (input_schema = JSON schema) → Gemini Tool (parametersJsonSchema 사용).
 * parametersJsonSchema는 unknown 타입이라 그대로 통과.
 */
export function toolsToGemini(
  tools: AgentTool[] | undefined,
): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const decls: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    // JSON Schema 그대로 전달 (parametersJsonSchema). parameters 필드(레거시 Schema)와는 mutually exclusive.
    parametersJsonSchema: t.input_schema as unknown,
  }));
  return [{ functionDeclarations: decls }];
}

// 위에서 Schema import는 사용 안 하지만 타입 호환성을 위해 keep
void (null as unknown as Schema | undefined);

// ─────────────────────────────────────────────────────────
// Messages: Anthropic.MessageParam[] → Gemini Content[]
// ─────────────────────────────────────────────────────────

/**
 * Anthropic 의 user/assistant message + content blocks를 Gemini Content 배열로 변환.
 *
 * Anthropic role        Gemini role
 *   user                 user
 *   assistant            model
 *
 * Block types:
 *   text                       → { text }
 *   tool_use (assistant)       → { functionCall: { id, name, args } }
 *   tool_result (user)         → { functionResponse: { id, name, response } }
 */
export function messagesToGemini(
  messages: Anthropic.MessageParam[],
): { contents: Content[]; toolNameById: Map<string, string> } {
  const contents: Content[] = [];
  const toolNameById = new Map<string, string>(); // tool_use_id → name 역추적

  for (const msg of messages) {
    const parts: Part[] = [];
    const role = msg.role === "assistant" ? "model" : "user";

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else {
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "tool_use") {
          // assistant가 tool 호출 — 회신 메시지에선 원래 thoughtSignature를 같이 보내야 함.
          toolNameById.set(block.id, block.name);
          const sig = recallThoughtSignature(block.id);
          parts.push({
            ...(sig ? { thoughtSignature: sig } : {}),
            functionCall: {
              id: block.id,
              name: block.name,
              args: (block.input ?? {}) as Record<string, unknown>,
            },
          });
        } else if (block.type === "tool_result") {
          // user가 tool 결과 회신
          const toolName = toolNameById.get(block.tool_use_id) ?? "unknown_tool";
          const responseObj = parseToolResultContent(block.content);
          parts.push({
            functionResponse: {
              id: block.tool_use_id,
              name: toolName,
              response: responseObj,
            },
          });
        }
        // 기타 block(image 등) 스킵 — 현재 미지원
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { contents, toolNameById };
}

function parseToolResultContent(
  content: Anthropic.ToolResultBlockParam["content"],
): Record<string, unknown> {
  if (typeof content === "string") {
    // route.ts는 JSON.stringify(out.result)로 직렬화해서 보냄. 다시 parse 시도.
    try {
      const parsed = JSON.parse(content);
      // Gemini의 functionResponse.response는 JSON object여야 함 (proto repeating 필드 아님).
      // - primitive(string/number/boolean/null) → { result }
      // - array → { items } (Gemini가 list 받으면 INVALID_ARGUMENT)
      // - object → 그대로
      if (Array.isArray(parsed)) return { items: parsed };
      if (parsed === null || typeof parsed !== "object") {
        return { result: parsed };
      }
      return parsed as Record<string, unknown>;
    } catch {
      return { result: content };
    }
  }
  // ContentBlockParam[] 형태 — text만 추출해서 합침
  if (Array.isArray(content)) {
    const text = content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    return { result: text };
  }
  return { result: String(content) };
}

// ─────────────────────────────────────────────────────────
// Gemini Response → Anthropic.Message 정규화
// ─────────────────────────────────────────────────────────

let toolUseSeq = 0;
function genToolUseId(name: string): string {
  toolUseSeq = (toolUseSeq + 1) % 1_000_000;
  return `gem_${Date.now().toString(36)}_${toolUseSeq}_${name}`;
}

/**
 * Gemini는 functionCall 응답에 thoughtSignature를 함께 반환하고, 후속 turn에서 같은 functionCall을
 * 회신 메시지에 포함할 때 이 signature를 그대로 재사용해야 함 (없으면 INVALID_ARGUMENT 400 발생).
 *
 * Anthropic ToolUseBlock에는 signature를 담을 자리가 없으므로, tool_use_id를 키로 별도 Map에 stash.
 * tool roundtrip이 단일 request 안에서 완결되므로 메모리 누수 위험은 낮음 (key 수십 개 수준).
 */
const thoughtSignatureById = new Map<string, string>();
const SIG_MAP_MAX = 5_000;

function rememberThoughtSignature(id: string, sig: string): void {
  if (thoughtSignatureById.size > SIG_MAP_MAX) {
    // 가장 오래된 entries 절반 drop
    const drop = Math.floor(SIG_MAP_MAX / 2);
    let i = 0;
    for (const k of thoughtSignatureById.keys()) {
      if (i++ >= drop) break;
      thoughtSignatureById.delete(k);
    }
  }
  thoughtSignatureById.set(id, sig);
}

function recallThoughtSignature(id: string): string | undefined {
  return thoughtSignatureById.get(id);
}

/**
 * Gemini GenerateContentResponse → Anthropic.Message.
 * - candidates[0].content.parts에서 text 모음 + functionCall 모음
 * - usageMetadata → Anthropic usage 형태
 * - finishReason → stop_reason
 */
export function geminiResponseToAnthropic(
  resp: GenerateContentResponse,
  modelId: string,
): Anthropic.Message {
  const candidate = resp.candidates?.[0];
  const geminiContent = candidate?.content;
  const parts = geminiContent?.parts ?? [];

  const blocks: Anthropic.ContentBlock[] = [];
  let collectedText = "";
  let hasToolUse = false;

  for (const p of parts) {
    if (typeof p.text === "string" && p.text.length > 0) {
      collectedText += p.text;
    }
    if (p.functionCall) {
      // text가 누적된 게 있으면 먼저 push
      if (collectedText.length > 0) {
        blocks.push({
          type: "text",
          text: collectedText,
          citations: null,
        });
        collectedText = "";
      }
      const id = p.functionCall.id ?? genToolUseId(p.functionCall.name ?? "fn");
      blocks.push({
        type: "tool_use",
        id,
        name: p.functionCall.name ?? "unknown",
        input: (p.functionCall.args ?? {}) as Record<string, unknown>,
      } as Anthropic.ToolUseBlock);
      hasToolUse = true;

      // 후속 turn에서 같은 functionCall을 회신할 때 thoughtSignature가 있어야 Gemini가 받음.
      if (typeof p.thoughtSignature === "string" && p.thoughtSignature.length > 0) {
        rememberThoughtSignature(id, p.thoughtSignature);
      }
    }
  }
  if (collectedText.length > 0) {
    blocks.push({
      type: "text",
      text: collectedText,
      citations: null,
    });
  }

  const stop_reason: Anthropic.StopReason = hasToolUse
    ? "tool_use"
    : finishReasonToAnthropic(candidate?.finishReason);

  const usageMeta = resp.usageMetadata;
  const usage = {
    input_tokens: usageMeta?.promptTokenCount ?? 0,
    output_tokens: usageMeta?.candidatesTokenCount ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: usageMeta?.cachedContentTokenCount ?? 0,
    cache_creation: null,
    server_tool_use: null,
    service_tier: null,
    // Anthropic.Usage가 inference_geo를 추가했음 (SDK upgrade) — Gemini 응답엔 없으므로 null
    inference_geo: null,
  } as unknown as Anthropic.Usage;

  return {
    id: resp.responseId ?? `gem_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    model: modelId,
    content: blocks,
    stop_reason,
    stop_sequence: null,
    usage,
    container: null,
  } as unknown as Anthropic.Message;
}

function finishReasonToAnthropic(
  reason: string | undefined,
): Anthropic.StopReason {
  switch (reason) {
    case "STOP":
      return "end_turn";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "refusal";
    default:
      return "end_turn";
  }
}
