// 다솜의 캡처 자동 분류 (Haiku 4.5, JSON 응답).
// 입력 1건 → 카테고리(todo/idea/learning/read_later) + 한 줄 요약 + 추천 액션.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `당신은 세심하고 친근한 캡처 비서 다솜입니다. 사용자가 적은 메모/URL/텍스트를 받아 다음 4가지 카테고리 중 하나로 분류합니다.

[카테고리]
- todo: 해야 할 일 / 마감이 있는 작업 / 행동 요구
- idea: 떠오른 아이디어 / 가설 / 시도해볼 것
- learning: 배운 점 / 깨달음 / 사실
- read_later: 나중에 읽을 URL이나 글

[추가 정보]
- summary: 한 줄 요약 (한국어, 15단어 이내)
- confidence: 0.0-1.0 (분류 확신도)

응답은 반드시 JSON만:
{"category": "todo|idea|learning|read_later", "summary": "한 줄 요약", "confidence": 0.85}

JSON 외 텍스트 금지.`;

export type CategorizeResult = {
  category: "todo" | "idea" | "learning" | "read_later";
  summary: string;
  confidence: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export async function categorizeCapture(params: {
  content: string;
  url?: string | null;
}): Promise<CategorizeResult> {
  const lines = [
    params.url ? `URL: ${params.url}` : null,
    `내용: ${params.content.slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await invokeAgent({
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 300,
    temperature: 0.1,
    messages: [{ role: "user", content: lines }],
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

  return {
    category: parsed.category,
    summary: parsed.summary,
    confidence: parsed.confidence,
    costUsd: calculateCostUsd(MODEL, usage),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

function parseJson(text: string): {
  category: "todo" | "idea" | "learning" | "read_later";
  summary: string;
  confidence: number;
} {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { category: "idea", summary: text.slice(0, 80), confidence: 0 };
  }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const cat = typeof obj.category === "string" ? obj.category.toLowerCase() : "idea";
    const valid = ["todo", "idea", "learning", "read_later"].includes(cat);
    return {
      category: (valid ? cat : "idea") as "todo" | "idea" | "learning" | "read_later",
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
    };
  } catch {
    return { category: "idea", summary: text.slice(0, 80), confidence: 0 };
  }
}

export const CATEGORIZE_META = { model: MODEL } as const;
