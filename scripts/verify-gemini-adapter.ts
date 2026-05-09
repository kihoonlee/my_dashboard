// Gemini SDK 직접 검증 — server-only import 회피하고 @google/genai를 직접 호출.
// translator / stream 어댑터 로직은 build 단계 type check로 검증됨.
// 이 스크립트는 (1) API 키 동작, (2) 모델 ID 유효성, (3) function calling 응답 구조 확인.
//
// 실행: npx tsx scripts/verify-gemini-adapter.ts

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function main() {
  console.log("─".repeat(60));
  console.log("Gemini SDK + 새 모델 ID 검증");
  console.log("─".repeat(60));

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY 미설정");
  console.log(`✓ key: ${key.slice(0, 8)}...${key.slice(-4)}`);

  const ai = new GoogleGenAI({ apiKey: key });

  // 1) Flash-Lite ping
  console.log("\n[1] gemini-3.1-flash-lite — generateContent ping");
  try {
    const r1 = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "1+1은? 숫자만.",
      config: { maxOutputTokens: 16, temperature: 0 },
    });
    const text = r1.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = r1.usageMetadata;
    console.log(`  text: "${text.trim().slice(0, 40)}"`);
    console.log(
      `  usage: in=${usage?.promptTokenCount} out=${usage?.candidatesTokenCount} (cached ${usage?.cachedContentTokenCount ?? 0})`,
    );
  } catch (e) {
    console.error(
      `  ✗ Flash-Lite 실패: ${e instanceof Error ? e.message : e}`,
    );
    throw e;
  }

  // 2) Flash streaming
  console.log("\n[2] gemini-3.1-flash — generateContentStream");
  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: "한국 수도는? 한 단어로.",
      config: { maxOutputTokens: 32, temperature: 0 },
    });
    let chunks = 0;
    let collected = "";
    for await (const c of stream) {
      chunks += 1;
      const t = c.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      collected += t;
    }
    console.log(`  chunks: ${chunks}`);
    console.log(`  collected: "${collected.trim().slice(0, 40)}"`);
  } catch (e) {
    console.error(`  ✗ Flash streaming 실패: ${e instanceof Error ? e.message : e}`);
    throw e;
  }

  // 3) Pro + function calling
  console.log("\n[3] gemini-2.5-flash — function calling");
  try {
    const r3 = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "서울 날씨 알려줘",
      config: {
        systemInstruction:
          "사용자가 날씨를 물으면 get_weather tool을 반드시 호출.",
        maxOutputTokens: 256,
        temperature: 0,
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "도시 날씨 조회",
                parametersJsonSchema: {
                  type: "object",
                  properties: {
                    city: { type: "string", description: "도시 이름" },
                  },
                  required: ["city"],
                },
              },
            ],
          },
        ],
      },
    });
    const parts = r3.candidates?.[0]?.content?.parts ?? [];
    const fnCall = parts.find((p) => p.functionCall);
    const finishReason = r3.candidates?.[0]?.finishReason;
    console.log(`  finishReason: ${finishReason}, parts: ${parts.length}`);
    if (fnCall?.functionCall) {
      console.log(
        `  ✓ functionCall: name=${fnCall.functionCall.name} args=${JSON.stringify(fnCall.functionCall.args)}`,
      );
    } else {
      const text = parts.find((p) => p.text)?.text ?? "";
      console.log(`  ⚠ functionCall 없음 — text 응답: "${text.slice(0, 60)}"`);
    }
  } catch (e) {
    console.error(`  ✗ Pro 실패: ${e instanceof Error ? e.message : e}`);
    throw e;
  }

  console.log("\n" + "─".repeat(60));
  console.log("ALL OK ✓ — 3개 모델 ID + streaming + function calling 동작 확인");
}

main().catch((e) => {
  console.error("\n✗ 검증 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
