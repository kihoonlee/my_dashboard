// GitHub 활동 요약 LLM 헬퍼.
// 모델: claude-haiku-4-5-20251001 (저렴, 한국어 OK)
// prompt caching 활용 — 시스템 프롬프트는 ephemeral cache로 시즈닝 후 repo별 호출 시 cache hit.
// 입력 컨텍스트는 메타(title + first-line message)만. diff는 보내지 않는다.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { invokeAgent } from "@/lib/anthropic/client";
import { calculateCostUsd } from "@/lib/anthropic/pricing";

const DIGEST_MODEL = "claude-haiku-4-5-20251001";

const REPO_SUMMARY_PROMPT = `당신은 사업 매니저 현주의 보조입니다. 한 GitHub 프로덕트의 최근 활동을 1-3문장의 한국어로 요약합니다.

원칙:
- 무엇이 추가/수정됐는지, 어떤 기능을 하는지에 집중. 형식·도구 이름 같은 메타는 생략.
- 군더더기 없는 보고체. 추정은 "보임"/"추정"으로 표시.
- 활동이 적으면 "주요 변경: <한 줄>"처럼 압축. 활동이 많으면 카테고리(기능/버그/리팩토링)로 묶음.
- 1-3문장. 최대 200자. bullet 없이 평문.`;

const HEADLINE_PROMPT = `당신은 사업 매니저 현주의 보조입니다. 여러 프로덕트의 다이제스트를 받아 전체 헤드라인 보고서를 작성합니다.

형식:
- 첫 문장: 가장 활발한 1-2개 프로덕트 + 그 핵심 변경
- 둘째 문장(선택): 그 외 주목할만한 변경 1건
- 정체된 프로덕트는 언급 안 함
- 한국어, 평문, 최대 300자`;

type LlmResult = {
  summary: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreate: number;
  cacheRead: number;
};

export type RepoActivity = {
  type: "commit" | "pull_request" | "issue";
  title: string;
  createdAt: Date;
};

export async function summarizeRepoActivity(params: {
  productName: string;
  repoFullName: string;
  activities: RepoActivity[];
  periodDays: number;
}): Promise<LlmResult> {
  const { productName, repoFullName, activities, periodDays } = params;

  // input 본문 빌드 — 카테고리별 분리 + title 리스트
  const commits = activities.filter((a) => a.type === "commit");
  const prs = activities.filter((a) => a.type === "pull_request");
  const issues = activities.filter((a) => a.type === "issue");

  const lines: string[] = [
    `프로덕트: ${productName} (${repoFullName})`,
    `기간: 최근 ${periodDays}일 신규 활동 ${activities.length}건`,
    "",
  ];
  if (commits.length > 0) {
    lines.push(`## 커밋 (${commits.length}건)`);
    for (const c of commits) lines.push(`- ${truncate(c.title, 200)}`);
    lines.push("");
  }
  if (prs.length > 0) {
    lines.push(`## PR (${prs.length}건)`);
    for (const p of prs) lines.push(`- ${truncate(p.title, 200)}`);
    lines.push("");
  }
  if (issues.length > 0) {
    lines.push(`## Issue (${issues.length}건)`);
    for (const i of issues) lines.push(`- ${truncate(i.title, 200)}`);
    lines.push("");
  }

  const userMessage = lines.join("\n");

  const res = await invokeAgent({
    model: DIGEST_MODEL,
    systemPrompt: REPO_SUMMARY_PROMPT,
    maxTokens: 400,
    temperature: 0.2,
    messages: [{ role: "user", content: userMessage }],
    cacheSystemAndTools: true,
  });

  return extractResult(res, DIGEST_MODEL);
}

export async function summarizeHeadline(params: {
  periodDays: number;
  productDigests: Array<{
    productName: string;
    activityCount: number;
    summary: string;
  }>;
}): Promise<LlmResult> {
  const { periodDays, productDigests } = params;
  const lines: string[] = [
    `기간: 최근 ${periodDays}일`,
    `활성 프로덕트: ${productDigests.length}개`,
    "",
    "각 프로덕트 다이제스트:",
  ];
  for (const p of productDigests) {
    lines.push(
      `- ${p.productName} (활동 ${p.activityCount}건): ${p.summary}`,
    );
  }
  const userMessage = lines.join("\n");

  const res = await invokeAgent({
    model: DIGEST_MODEL,
    systemPrompt: HEADLINE_PROMPT,
    maxTokens: 500,
    temperature: 0.2,
    messages: [{ role: "user", content: userMessage }],
    cacheSystemAndTools: true,
  });

  return extractResult(res, DIGEST_MODEL);
}

// ───────────────────────────────────────────────────────────

function extractResult(
  res: Awaited<ReturnType<typeof invokeAgent>>,
  model: string,
): LlmResult {
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
  const costUsd = calculateCostUsd(model, usage);

  return {
    summary: text || "(빈 요약)",
    costUsd,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreate: usage.cache_creation_input_tokens,
    cacheRead: usage.cache_read_input_tokens,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export const DIGEST_META = {
  model: DIGEST_MODEL,
} as const;
