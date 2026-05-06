// Anthropic SDK singleton + 모델 호출 헬퍼.
// claude-api skill 가이드 준수:
// - prompt caching (시스템 프롬프트 + tool defs 캐시)
// - 모델 ID는 시드 (definitions.ts)에서 그대로 사용 — `claude-sonnet-4-6` / `claude-haiku-4-5-...`
// - 4.6 이상은 streaming 권장 (max_tokens > ~16K), Phase 1 단계에서는 비-스트리밍 1024-tokens.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";

let client: Anthropic | null = null;
let cachedKeyFromFile: string | undefined;

/**
 * 부모 셸이 ANTHROPIC_API_KEY="" (빈 값)으로 export하면 Next.js의 dotenv는 default
 * override:false 정책으로 .env.local 값을 적용하지 않는다 (Claude Code harness가
 * 자식 프로세스에 빈 값 주입하는 케이스 등). 이 fallback은 process.env가 비어있을 때
 * .env.local을 직접 파싱한다.
 */
function readApiKeyFromEnvFile(): string | undefined {
  if (cachedKeyFromFile !== undefined) return cachedKeyFromFile;
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    const m = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    cachedKeyFromFile = m?.[1].trim();
  } catch {
    cachedKeyFromFile = undefined;
  }
  return cachedKeyFromFile;
}

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    apiKey = readApiKeyFromEnvFile();
  }
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

/**
 * Streaming invoke — invokeAgent와 동일 인자, MessageStream 반환.
 * 호출자는 async iterator로 RawMessageStreamEvent 순회 + .finalMessage()로 종료 메시지 획득.
 *
 * SDK의 stream()이 cache_creation_input_tokens / cache_read_input_tokens 등 usage 메타도
 * 최종 message에 포함해 돌려준다. 일반 invoke와 동일한 비용 계산 가능.
 */
export function streamAgent(params: {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature?: number;
  messages: Anthropic.MessageParam[];
  tools?: AgentTool[];
  cacheSystemAndTools?: boolean;
}): import("@anthropic-ai/sdk/lib/MessageStream").MessageStream {
  const anthropic = getAnthropicClient();
  const cache = !!params.cacheSystemAndTools;
  const system = buildSystem(params.systemPrompt, cache);
  const tools = buildTools(params.tools, cache);

  return anthropic.messages.stream({
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
