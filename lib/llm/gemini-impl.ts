// Gemini 구현체 — @google/genai SDK 호출 + Anthropic.Message 형태로 정규화.
// 외부 인터페이스(invokeAgent/streamAgent)는 lib/llm/router.ts에서 dispatch.

import "server-only";
import { GoogleGenAI } from "@google/genai";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveApiKey } from "@/lib/secrets/resolver";
import type { InvokeAgentParams, StreamHandle } from "@/lib/llm/router";
import {
  geminiResponseToAnthropic,
  messagesToGemini,
  toolsToGemini,
} from "@/lib/llm/translators";
import { GeminiMessageStreamAdapter } from "@/lib/llm/gemini-stream";

async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await resolveApiKey("gemini");
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not available. Set it in /settings or .env.local.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

function buildConfig(params: InvokeAgentParams) {
  const tools = toolsToGemini(params.tools);
  return {
    systemInstruction: params.systemPrompt,
    maxOutputTokens: params.maxTokens,
    ...(typeof params.temperature === "number"
      ? { temperature: params.temperature }
      : {}),
    ...(tools ? { tools } : {}),
    // cacheSystemAndTools는 무시 — Gemini는 implicit caching이 자동 90% off
  };
}

export async function invokeGemini(
  params: InvokeAgentParams,
): Promise<Anthropic.Message> {
  const ai = await getGeminiClient();
  const { contents } = messagesToGemini(params.messages);

  const resp = await ai.models.generateContent({
    model: params.model,
    contents,
    config: buildConfig(params),
  });

  return geminiResponseToAnthropic(resp, params.model);
}

export async function streamGemini(
  params: InvokeAgentParams,
): Promise<StreamHandle> {
  const ai = await getGeminiClient();
  const { contents } = messagesToGemini(params.messages);

  const stream = await ai.models.generateContentStream({
    model: params.model,
    contents,
    config: buildConfig(params),
  });

  return new GeminiMessageStreamAdapter(stream, params.model);
}
