// API 키 검증 — 실제 provider API에 가벼운 호출 1회.
// 모두 비용 ≈ $0 (models 목록 / user 정보).
// 401/403 → invalid 키, 그 외 네트워크/서버 오류는 별도 메시지.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { ApiKeyProvider } from "@/lib/secrets/api-key-store";

export type ValidateResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string };

export async function validateApiKey(
  provider: ApiKeyProvider,
  apiKey: string,
): Promise<ValidateResult> {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "키가 너무 짧습니다" };
  }
  switch (provider) {
    case "anthropic":
      return validateAnthropic(trimmed);
    case "openai":
      return validateOpenAI(trimmed);
    case "github":
      return validateGithub(trimmed);
    case "gemini":
      return validateGemini(trimmed);
  }
}

async function validateAnthropic(apiKey: string): Promise<ValidateResult> {
  try {
    const client = new Anthropic({ apiKey });
    const list = await client.models.list({ limit: 1 });
    const first = list.data?.[0]?.id;
    return { ok: true, detail: first ? `models 접근 OK (${first})` : "OK" };
  } catch (e) {
    return mapError(e, "Anthropic");
  }
}

async function validateOpenAI(apiKey: string): Promise<ValidateResult> {
  try {
    const client = new OpenAI({ apiKey });
    const list = await client.models.list();
    const count = list.data?.length ?? 0;
    return { ok: true, detail: `models ${count}개 접근 OK` };
  } catch (e) {
    return mapError(e, "OpenAI");
  }
}

async function validateGemini(apiKey: string): Promise<ValidateResult> {
  try {
    const client = new GoogleGenAI({ apiKey });
    // 가벼운 ping — 1 토큰 generate.
    const resp = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "ping",
      config: { maxOutputTokens: 1 },
    });
    const ok = !!resp.candidates;
    return ok
      ? { ok: true, detail: "generateContent ping OK" }
      : { ok: false, error: "Gemini: 응답 없음" };
  } catch (e) {
    return mapError(e, "Gemini");
  }
}

async function validateGithub(apiKey: string): Promise<ValidateResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${apiKey}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { login?: string };
      return {
        ok: true,
        detail: j.login ? `${j.login} 인증 OK` : "OK",
      };
    }
    if (res.status === 401) {
      return { ok: false, error: "GitHub: 키가 유효하지 않습니다 (401)" };
    }
    if (res.status === 403) {
      return { ok: false, error: "GitHub: 권한 부족 (403)" };
    }
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `GitHub ${res.status} ${res.statusText}: ${text.slice(0, 120)}`,
    };
  } catch (e) {
    return mapError(e, "GitHub");
  }
}

function mapError(e: unknown, label: string): ValidateResult {
  // SDK들이 status 코드를 노출함. 401/403만 "invalid"로 분류.
  const errAny = e as {
    status?: number;
    message?: string;
    error?: { message?: string };
  };
  const status = typeof errAny.status === "number" ? errAny.status : undefined;
  const msg =
    errAny.error?.message ?? errAny.message ?? (e instanceof Error ? e.message : String(e));

  if (status === 401) {
    return { ok: false, error: `${label}: 키가 유효하지 않습니다 (401)` };
  }
  if (status === 403) {
    return { ok: false, error: `${label}: 권한 부족 (403)` };
  }
  if (status === 429) {
    return { ok: false, error: `${label}: rate limit (429) — 키 자체는 유효할 수 있습니다` };
  }
  return { ok: false, error: `${label} 검증 실패: ${msg}` };
}
