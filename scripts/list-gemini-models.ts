// 현재 키로 generateContent 가능한 Gemini 모델 ID 일람.
import { GoogleGenAI } from "@google/genai";

async function main() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY 미설정");
  const ai = new GoogleGenAI({ apiKey: key });

  const pager = await ai.models.list();
  const all: string[] = [];
  for await (const m of pager) {
    if (m.supportedActions?.includes("generateContent")) {
      all.push(m.name ?? "?");
    }
  }
  console.log("generateContent supported models:");
  for (const n of all) console.log(`  ${n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
