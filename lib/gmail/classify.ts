// 정연(메일 정리자)의 AI 우선순위 분류 헬퍼.
// Haiku 4.5 + JSON 응답 강제 + prompt caching.
// 메일 N건을 한 번에 보내 batch 분류 (token 절약).

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";

const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 10; // 한 번에 분류할 메일 수

const SYSTEM_PROMPT = `당신은 깔끔하고 효율적인 메일 정리자 정연입니다. 받은 메일을 4단계 우선순위로 분류합니다.

[우선순위]
- urgent: 긴급 회신 필요 (24h 내). 명시적 마감/긴급 표시, 사람의 직접 메시지 + 응답 요청.
- important: 답장 필요하지만 며칠 여유 (1주 내). 업무·계약·프로젝트.
- normal: 읽기만 하면 되는 정보성. 알림·공지·뉴스레터 본문.
- promotion: 광고·홍보·세일·자동 마케팅.

[needsReply]
- true: 사람이 직접 보낸 메시지 + 명시적/암시적 답장 요청.
- false: 자동 알림, 광고, 단순 공지.

응답은 반드시 다음 JSON 배열만:
[{"id": "<gmail_message_id>", "priority": "urgent|important|normal|promotion", "needsReply": true|false, "summary": "한 줄 요약(15단어 이내)"}, ...]

JSON 외 다른 텍스트를 포함하지 말 것.`;

export type ClassifyInput = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
};

export type ClassifyOutput = {
  id: string;
  priority: "urgent" | "important" | "normal" | "promotion";
  needsReply: boolean;
  summary: string;
};

export type ClassifyResult = {
  classifications: ClassifyOutput[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreate: number;
};

/**
 * 한 번에 BATCH_SIZE개씩 LLM에 보내 분류. 응답 파싱 실패 시 빈 배열로 fallback.
 */
export async function classifyMails(
  mails: ClassifyInput[],
): Promise<ClassifyResult> {
  const result: ClassifyResult = {
    classifications: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheCreate: 0,
  };

  for (let i = 0; i < mails.length; i += BATCH_SIZE) {
    const batch = mails.slice(i, i + BATCH_SIZE);
    const userMessage = batch
      .map(
        (m, idx) =>
          `### ${idx + 1}. id=${m.id}\nFrom: ${trim(m.from, 120)}\nSubject: ${trim(m.subject, 200)}\nSnippet: ${trim(m.snippet, 400)}`,
      )
      .join("\n\n");

    const res = await invokeAgent({
      model: CLASSIFY_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0.1,
      messages: [{ role: "user", content: userMessage }],
      cacheSystemAndTools: true,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseJsonArray(text);
    for (const c of parsed) {
      if (typeof c.id === "string" && typeof c.priority === "string") {
        result.classifications.push({
          id: c.id,
          priority: normalizePriority(c.priority),
          needsReply: !!c.needsReply,
          summary: typeof c.summary === "string" ? c.summary.trim() : "",
        });
      }
    }

    const usage = {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
    };
    result.costUsd += calculateCostUsd(CLASSIFY_MODEL, usage);
    result.inputTokens += usage.input_tokens;
    result.outputTokens += usage.output_tokens;
    result.cacheCreate += usage.cache_creation_input_tokens;
    result.cacheRead += usage.cache_read_input_tokens;
  }

  return result;
}

const SUMMARIZE_SYSTEM = `당신은 깔끔하고 효율적인 메일 정리자 정연입니다. 한 메일 스레드의 메시지들을 받아 한국어로 핵심을 요약합니다.

원칙:
- 주제 한 줄 + 핵심 내용 2-3문장 + 답장 시 다뤄야 할 포인트 (있다면).
- 군더더기·인사말 생략. 사실 기반.
- 최대 300자.`;

export async function summarizeThread(params: {
  threadId: string;
  messages: Array<{ from: string; subject: string; snippet: string; date: string }>;
}): Promise<{
  summary: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const lines: string[] = [
    `Thread ID: ${params.threadId}`,
    `메시지 수: ${params.messages.length}`,
    "",
  ];
  for (let i = 0; i < params.messages.length; i++) {
    const m = params.messages[i];
    lines.push(
      `### ${i + 1}. ${m.date} — From: ${trim(m.from, 100)}`,
      `Subject: ${trim(m.subject, 200)}`,
      `Snippet: ${trim(m.snippet, 500)}`,
      "",
    );
  }

  const res = await invokeAgent({
    model: CLASSIFY_MODEL,
    systemPrompt: SUMMARIZE_SYSTEM,
    maxTokens: 500,
    temperature: 0.2,
    messages: [{ role: "user", content: lines.join("\n") }],
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

  return {
    summary: text || "(빈 요약)",
    costUsd: calculateCostUsd(CLASSIFY_MODEL, usage),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

export const CLASSIFY_META = {
  model: CLASSIFY_MODEL,
  batchSize: BATCH_SIZE,
} as const;

// ─────────────────────────────────────────────────────────

function trim(s: string | undefined, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function normalizePriority(
  v: string,
): "urgent" | "important" | "normal" | "promotion" {
  const lower = v.toLowerCase();
  if (lower.includes("urgent") || lower.includes("긴급")) return "urgent";
  if (lower.includes("important") || lower.includes("중요")) return "important";
  if (lower.includes("promotion") || lower.includes("광고")) return "promotion";
  return "normal";
}

/**
 * LLM이 가끔 ```json ... ``` 펜스로 감싸거나 앞뒤 텍스트를 붙이는 케이스 대응.
 */
function parseJsonArray(text: string): Array<Record<string, unknown>> {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  // 가장 바깥 [ ... ] 블록 추출
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
