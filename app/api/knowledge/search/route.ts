// GET /api/knowledge/search?q=...&limit=10
// 옵시디언 노트 의미 검색 (pgvector cosine).
// 쿼리 → OpenAI 임베딩 → obsidian_notes 코사인 거리 오름차순 → 상위 N개.
// score = 1 - cosine_distance (0~1, 1이 가장 유사).

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { embedOne } from "@/lib/openai/embeddings";

type SearchRow = {
  id: string;
  file_path: string;
  title: string;
  preview: string;
  tags: unknown;
  score: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const limit = Math.max(
    1,
    Math.min(50, parseInt(searchParams.get("limit") ?? "10", 10) || 10),
  );

  if (!q) {
    return NextResponse.json({ query: "", results: [] });
  }

  let queryVec: number[];
  try {
    queryVec = await embedOne(q);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "embedding_failed", message: msg },
      { status: 500 },
    );
  }

  // pgvector literal — drizzle raw sql에서 number[]를 vector로 캐스팅하기 위해 [..] 형식 텍스트로 바인딩.
  const literal = `[${queryVec.join(",")}]`;

  const rows = (await db.execute<SearchRow>(sql`
    SELECT
      id::text AS id,
      file_path,
      title,
      LEFT(content, 300) AS preview,
      tags,
      (1 - (embedding <=> ${literal}::vector))::float AS score
    FROM obsidian_notes
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `)) as unknown as SearchRow[];

  return NextResponse.json({
    query: q,
    results: rows.map((r) => ({
      id: r.id,
      filePath: r.file_path,
      title: r.title,
      preview: r.preview,
      tags: Array.isArray(r.tags) ? r.tags : [],
      score: r.score,
    })),
  });
}
