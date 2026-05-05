// Anthropic 모델별 토큰 가격 (USD per 1M tokens, 2026-04 기준).
// Models cached source: shared/models.md from claude-api skill.
//
// 비용 가드(lib/agents/guard.ts)와 agent_logs.cost_usd 계산에 사용.
// 모델 추가 시 여기에 등록.

export type ModelPricing = {
  /** USD per 1M input tokens (uncached) */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache write tokens (~1.25x input for 5min TTL) */
  cacheWrite: number;
  /** USD per 1M cache read tokens (~0.1x input) */
  cacheRead: number;
};

const PRICING: Record<string, ModelPricing> = {
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
};

/**
 * 호출당 비용 계산. 가격 미등록 모델은 0 반환 (한도 검사 회피보다 명시적 0이 안전).
 * 호출 직후 agent_logs.cost_usd에 6 decimal 정밀도로 저장.
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
