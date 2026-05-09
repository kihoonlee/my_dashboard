// Gemini stream → Anthropic MessageStream 호환 어댑터.
//
// route.ts:341-360의 패턴:
//   const ms = await streamAgent(...);
//   for await (const event of ms) {
//     if (event.type === "content_block_delta" && event.delta.type === "text_delta") emit(...);
//   }
//   const final = await ms.finalMessage();
//
// → 이 어댑터는 Gemini chunk를 받으면서 text_delta 이벤트를 yield하고,
//   끝까지 다 보고 finalMessage()로 누적 결과를 Anthropic.Message 형태로 반환.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentResponse } from "@google/genai";
import { geminiResponseToAnthropic } from "@/lib/llm/translators";

export class GeminiMessageStreamAdapter
  implements AsyncIterable<Anthropic.RawMessageStreamEvent>
{
  private readonly stream: AsyncGenerator<GenerateContentResponse>;
  private readonly modelId: string;
  private readonly chunks: GenerateContentResponse[] = [];
  private finalCached: Anthropic.Message | null = null;
  private done = false;

  constructor(
    stream: AsyncGenerator<GenerateContentResponse>,
    modelId: string,
  ) {
    this.stream = stream;
    this.modelId = modelId;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Anthropic.RawMessageStreamEvent> {
    // start 이벤트는 굳이 emit 안 함 — route.ts는 content_block_delta만 본다
    let blockOpen = false;
    for await (const chunk of this.stream) {
      this.chunks.push(chunk);

      // 첫 chunk에 text가 있으면 content_block_start 한 번 yield
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      let chunkText = "";
      for (const p of parts) {
        if (typeof p.text === "string" && p.text.length > 0) {
          chunkText += p.text;
        }
      }

      if (chunkText.length > 0) {
        if (!blockOpen) {
          yield {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "", citations: null },
          } as unknown as Anthropic.RawMessageStreamEvent;
          blockOpen = true;
        }
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: chunkText },
        } as Anthropic.RawMessageStreamEvent;
      }
    }
    if (blockOpen) {
      yield {
        type: "content_block_stop",
        index: 0,
      } as Anthropic.RawMessageStreamEvent;
    }
    this.done = true;
  }

  /**
   * Gemini chunk를 다 받은 뒤 누적해서 Anthropic.Message로 반환.
   * iterator 소비 후 호출하는 게 정상. 호출 전이면 여기서 마저 소비.
   */
  async finalMessage(): Promise<Anthropic.Message> {
    if (this.finalCached) return this.finalCached;

    if (!this.done) {
      // iterator를 끝까지 안 돌렸을 수 있음 — drain (chunks 누적은 그대로 진행)
      for await (const chunk of this.stream) {
        this.chunks.push(chunk);
      }
      this.done = true;
    }

    // 마지막 chunk가 candidates + usageMetadata 전체를 들고 있는 경우가 많음.
    // 안전하게 — 모든 chunk 합쳐 single response 만들기.
    const merged = mergeChunks(this.chunks);
    this.finalCached = geminiResponseToAnthropic(merged, this.modelId);
    return this.finalCached;
  }
}

/**
 * chunks 리스트를 하나의 GenerateContentResponse로 합치기.
 * - text는 모든 chunk의 parts에서 누적
 * - functionCall은 chunk에 1회만 등장 (보통 마지막)
 * - usageMetadata는 마지막 chunk가 누적치를 보유 (Gemini SDK 동작)
 */
function mergeChunks(
  chunks: GenerateContentResponse[],
): GenerateContentResponse {
  if (chunks.length === 0) {
    return {
      candidates: [],
    } as unknown as GenerateContentResponse;
  }

  const last = chunks[chunks.length - 1];
  const allText: string[] = [];
  type PartT = NonNullable<
    NonNullable<
      NonNullable<GenerateContentResponse["candidates"]>[number]["content"]
    >["parts"]
  >[number];
  // functionCall + 그 part의 thoughtSignature를 같이 보존.
  const fnCallParts: PartT[] = [];

  for (const chunk of chunks) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === "string" && p.text.length > 0) {
        allText.push(p.text);
      }
      if (p.functionCall) {
        fnCallParts.push({
          ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
          functionCall: p.functionCall,
        });
      }
    }
  }

  // 합친 candidate 생성
  const mergedParts: NonNullable<
    NonNullable<
      NonNullable<GenerateContentResponse["candidates"]>[number]["content"]
    >["parts"]
  > = [];
  if (allText.length > 0) {
    mergedParts.push({ text: allText.join("") });
  }
  for (const f of fnCallParts) {
    mergedParts.push(f);
  }

  // last chunk를 base로 candidates만 교체
  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(last)),
    last,
  ) as GenerateContentResponse;
  merged.candidates = [
    {
      ...(last.candidates?.[0] ?? {}),
      content: {
        role: "model",
        parts: mergedParts,
      },
    },
  ];
  return merged;
}
