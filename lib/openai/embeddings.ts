// OpenAI 임베딩 헬퍼.
// 모델: text-embedding-3-small + dimensions=1024 (스키마 vector(1024) 호환).
// 한국어 성능 충분 + 비용 저렴 ($0.02/M tokens). 더 강력한 차원 필요시 large로 교체.

import "server-only";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { resolve } from "path";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const MAX_INPUT_TOKENS = 8191; // text-embedding-3-* 한도
// 한 번 호출당 batch input 한도 (OpenAI는 입력 배열 길이 2048까지). 안전 버퍼.
const BATCH_LIMIT = 96;

let client: OpenAI | null = null;
let cachedKeyFromFile: string | undefined;

function readApiKeyFromEnvFile(): string | undefined {
  if (cachedKeyFromFile !== undefined) return cachedKeyFromFile;
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    const m = content.match(/^OPENAI_API_KEY=(.+)$/m);
    cachedKeyFromFile = m?.[1].trim();
  } catch {
    cachedKeyFromFile = undefined;
  }
  return cachedKeyFromFile;
}

export function getOpenAIClient(): OpenAI {
  if (client) return client;
  let apiKey = process.env.OPENAI_API_KEY;
  // 부모 셸이 빈 값으로 export하는 케이스 fallback (anthropic/client.ts와 동일 패턴)
  if (!apiKey || apiKey.length === 0) {
    apiKey = readApiKeyFromEnvFile();
  }
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment (.env.local).");
  }
  client = new OpenAI({ apiKey });
  return client;
}

/**
 * 한 텍스트를 임베딩 벡터로 변환. 너무 긴 입력은 앞부분만 사용 (단순 truncate).
 * 청킹이 필요해지면 별도 obsidian_chunks 테이블로 확장.
 */
export async function embedOne(text: string): Promise<number[]> {
  const trimmed = truncateForEmbedding(text);
  const openai = getOpenAIClient();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const vec = res.data[0]?.embedding;
  if (!vec) throw new Error("OpenAI embedding response missing data");
  return vec;
}

/**
 * 여러 텍스트를 한 번에 임베딩. BATCH_LIMIT 단위로 분할 호출.
 * 반환은 입력 순서를 보존.
 */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getOpenAIClient();
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT).map(truncateForEmbedding);
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of res.data) {
      all.push(item.embedding);
    }
  }
  return all;
}

/**
 * 토큰 카운터 없이 char 기준 안전 truncate. 한국어 1글자 ≈ 1.5-2 token이라
 * MAX_INPUT_TOKENS의 약 60% 글자를 안전 한도로 사용.
 */
function truncateForEmbedding(text: string): string {
  const SAFE_CHARS = Math.floor(MAX_INPUT_TOKENS * 0.6);
  if (text.length <= SAFE_CHARS) return text;
  return text.slice(0, SAFE_CHARS);
}

export const EMBEDDING_META = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
} as const;
