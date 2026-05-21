// 일기 에이전트(달이) 전용 도구.
// - search_diaries / search_memos / get_diary: 검색·조회
// - propose_diary_block: UI에 "이 블록 일기에 추가하시겠어요?" 카드 띄우기 신호

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { diaryEntries, memos } from "@/lib/db/schema";
import { and, desc, eq, ilike, or } from "drizzle-orm";

// ---- search_diaries ----
export const searchDiariesTool: AgentTool = {
  name: "search_diaries",
  description:
    "이전 일기에서 키워드(또는 짧은 구문) 검색. title + body_md에 ilike. 최신순 상위 N개의 날짜 + 제목 + 발췌 반환. 검색어는 한국어/영어 OK.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "integer", description: "기본 5, 최대 10" },
    },
    required: ["query"],
  },
};

export async function runSearchDiaries(
  userId: string,
  input: Record<string, unknown>,
) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query) return { ok: false as const, error: "query required" };
  const limit =
    typeof input.limit === "number" && input.limit > 0
      ? Math.min(10, Math.floor(input.limit))
      : 5;
  const pattern = `%${query}%`;
  const rows = await db
    .select({
      entryDate: diaryEntries.entryDate,
      title: diaryEntries.title,
      bodyMd: diaryEntries.bodyMd,
    })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        or(
          ilike(diaryEntries.title, pattern),
          ilike(diaryEntries.bodyMd, pattern),
        ),
      ),
    )
    .orderBy(desc(diaryEntries.entryDate))
    .limit(limit);

  return {
    ok: true as const,
    result: {
      count: rows.length,
      items: rows.map((r) => ({
        date: r.entryDate,
        title: r.title,
        excerpt: r.bodyMd.slice(0, 240),
      })),
    },
  };
}

// ---- search_memos ----
export const searchMemosTool: AgentTool = {
  name: "search_memos",
  description:
    "이전 메모에서 키워드 검색. title + body_md ilike. 보관(archived)된 메모는 제외. 최신순 상위 N개 반환.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "integer", description: "기본 5, 최대 10" },
    },
    required: ["query"],
  },
};

export async function runSearchMemos(
  userId: string,
  input: Record<string, unknown>,
) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query) return { ok: false as const, error: "query required" };
  const limit =
    typeof input.limit === "number" && input.limit > 0
      ? Math.min(10, Math.floor(input.limit))
      : 5;
  const pattern = `%${query}%`;
  const rows = await db
    .select({
      id: memos.id,
      entryDate: memos.entryDate,
      title: memos.title,
      bodyMd: memos.bodyMd,
    })
    .from(memos)
    .where(
      and(
        eq(memos.userId, userId),
        eq(memos.archived, false),
        or(ilike(memos.title, pattern), ilike(memos.bodyMd, pattern)),
      ),
    )
    .orderBy(desc(memos.entryDate), desc(memos.createdAt))
    .limit(limit);

  return {
    ok: true as const,
    result: {
      count: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        date: r.entryDate,
        title: r.title,
        excerpt: r.bodyMd.slice(0, 240),
      })),
    },
  };
}

// ---- get_diary ----
export const getDiaryTool: AgentTool = {
  name: "get_diary",
  description:
    "특정 날짜의 일기 본문 전체 조회. entry_date는 YYYY-MM-DD. 없으면 null.",
  input_schema: {
    type: "object",
    properties: { entry_date: { type: "string" } },
    required: ["entry_date"],
  },
};

export async function runGetDiary(
  userId: string,
  input: Record<string, unknown>,
) {
  const entryDate =
    typeof input.entry_date === "string" ? input.entry_date : "";
  if (!entryDate) return { ok: false as const, error: "entry_date required" };
  const [row] = await db
    .select({
      title: diaryEntries.title,
      bodyMd: diaryEntries.bodyMd,
      mood: diaryEntries.mood,
    })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        eq(diaryEntries.entryDate, entryDate),
      ),
    )
    .limit(1);
  return {
    ok: true as const,
    result: row ? { ...row, date: entryDate } : null,
  };
}

// ---- propose_diary_block ----
// 이 도구는 DB write 안 함. tool_call 자체가 UI에 "사용자가 클릭하면 본문에 삽입할 후보"
// 카드를 띄우는 시그널. 사용자가 수락해야 실제 일기 본문에 들어감.
export const proposeDiaryBlockTool: AgentTool = {
  name: "propose_diary_block",
  description:
    "사용자에게 '이 마크다운 블록을 현재 작성 중인 일기에 추가하시겠어요?' 제안 카드를 띄움. 본인이 직접 일기 본문을 수정하지는 않음 — 사용자 수락 필요.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "추가 제안할 markdown 블록" },
      reason: {
        type: "string",
        description: "왜 이걸 추가하는지 한 줄 설명 (선택)",
      },
    },
    required: ["content"],
  },
};

export async function runProposeDiaryBlock(input: Record<string, unknown>) {
  const content = typeof input.content === "string" ? input.content : "";
  const reason = typeof input.reason === "string" ? input.reason : "";
  if (!content) return { ok: false as const, error: "content required" };
  return {
    ok: true as const,
    result: { proposal: { content, reason } },
  };
}

// ---- export bundle ----
export const diaryTools: AgentTool[] = [
  searchDiariesTool,
  searchMemosTool,
  getDiaryTool,
  proposeDiaryBlockTool,
];

export async function runDiaryTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "search_diaries":
      return runSearchDiaries(userId, input);
    case "search_memos":
      return runSearchMemos(userId, input);
    case "get_diary":
      return runGetDiary(userId, input);
    case "propose_diary_block":
      return runProposeDiaryBlock(input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}
