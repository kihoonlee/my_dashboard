// 서연(knowledge_librarian) 전용 tool 구현체.
// Phase 3 범위: 옵시디언 vault 의미 검색 + 단일 노트 조회.
//   - search_notes: 자연어 쿼리 → 임베딩 → 코사인 유사도 상위 N개
//   - get_note: file_path로 단일 노트 본문 조회

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { obsidianNotes } from "@/lib/db/schema";
import { embedOne } from "@/lib/openai/embeddings";
import type { AgentTool } from "@/lib/anthropic/client";

export const SEOYEON_TOOLS: AgentTool[] = [
  {
    name: "search_notes",
    description:
      "옵시디언 vault에서 자연어 쿼리로 의미 기반 검색. 코사인 유사도 상위 N개 노트의 file_path/title/preview/score 반환. 사용자 질문에 대한 사실 답변은 항상 이 도구로 먼저 검색해 출처를 확보한다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 쿼리 (한국어 OK)" },
        limit: {
          type: "number",
          description: "최대 결과 개수 (기본 5, 최대 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_note",
    description:
      "search_notes로 찾은 file_path로 노트 전체 본문을 가져온다. preview만으로 답이 부족할 때 사용.",
    input_schema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "vault root 기준 상대 경로 (예: 'index.md')",
        },
      },
      required: ["filePath"],
    },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

type SearchRow = {
  id: string;
  file_path: string;
  title: string;
  preview: string;
  tags: unknown;
  score: number;
};

export async function runSeoyeonTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "search_notes": {
        const query = asString(input.query)?.trim();
        if (!query) return { ok: false, error: "query is required" };
        const limitRaw =
          typeof input.limit === "number"
            ? input.limit
            : parseInt(asString(input.limit) ?? "5", 10);
        const limit = Math.max(1, Math.min(20, limitRaw || 5));

        const vec = await embedOne(query);
        const literal = `[${vec.join(",")}]`;

        const rows = (await db.execute<SearchRow>(sql`
          SELECT
            id::text AS id,
            file_path,
            title,
            LEFT(content, 500) AS preview,
            tags,
            (1 - (embedding <=> ${literal}::vector))::float AS score
          FROM obsidian_notes
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${limit}
        `)) as unknown as SearchRow[];

        return {
          ok: true,
          result: {
            query,
            count: rows.length,
            results: rows.map((r) => ({
              filePath: r.file_path,
              title: r.title,
              preview: r.preview,
              tags: Array.isArray(r.tags) ? r.tags : [],
              score: Number(r.score.toFixed(4)),
            })),
          },
        };
      }
      case "get_note": {
        const filePath = asString(input.filePath);
        if (!filePath) return { ok: false, error: "filePath is required" };
        const [row] = await db
          .select({
            filePath: obsidianNotes.filePath,
            title: obsidianNotes.title,
            content: obsidianNotes.content,
            tags: obsidianNotes.tags,
            wordCount: obsidianNotes.wordCount,
            lastModified: obsidianNotes.lastModified,
          })
          .from(obsidianNotes)
          .where(eq(obsidianNotes.filePath, filePath))
          .limit(1);
        if (!row) return { ok: false, error: `note not found: ${filePath}` };
        return { ok: true, result: row };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `seoyeon tool error: ${message}` };
  }
}
