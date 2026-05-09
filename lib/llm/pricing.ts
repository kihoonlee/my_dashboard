// LLM provider별 토큰 가격 (USD per 1M tokens, 2026-05 기준).
// Anthropic + Gemini 통합 표.
//
// 비용 가드(lib/agents/guard.ts)와 agent_logs.cost_usd 계산에 사용.
// 모델 추가 시 여기에 등록.

export type ModelPricing = {
  /** USD per 1M input tokens (uncached) */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache write tokens (Anthropic ~1.25x input for 5min TTL) */
  cacheWrite: number;
  /** USD per 1M cache read tokens (Anthropic ~0.1x input). Gemini implicit caching은 별도 계산 안 함 (자동 90% off가 input에 이미 반영). */
  cacheRead: number;
};

const PRICING: Record<string, ModelPricing> = {
  // ─── Anthropic ────────────────────────────────────────────
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cacheWrite: 6.25,
    cacheRead: 0.5,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },

  // ─── Gemini (200K 이하 컨텍스트 기준) ────────────────────
  // implicit caching은 자동 90% off — 별도 cacheRead 계산 안 함.
  // 2.5 family: GA 안정. 3.1: Lite만 GA, Pro/Flash는 preview (현재 미사용).
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10.0,
    cacheWrite: 0,
    cacheRead: 0,
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cacheWrite: 0,
    cacheRead: 0,
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cacheWrite: 0,
    cacheRead: 0,
  },
  "gemini-3.1-flash-lite": {
    input: 0.25,
    output: 1.5,
    cacheWrite: 0,
    cacheRead: 0,
  },
};

/**
 * 호출당 비용 계산. 가격 미등록 모델은 0 반환.
 * agent_logs.cost_usd에 6 decimal 정밀도로 저장.
 */
export function calculateCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  },
): number {
  const p = PRICING[model];
  if (!p) {
    console.warn(`[pricing] unknown model: ${model} — cost calculated as 0`);
    return 0;
  }
  const inputCost = (usage.input_tokens / 1_000_000) * p.input;
  const outputCost = (usage.output_tokens / 1_000_000) * p.output;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cacheWrite;
  const cacheReadCost =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}
