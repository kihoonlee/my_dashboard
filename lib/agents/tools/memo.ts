// 메모 에이전트(노트) 전용 도구.
// - list_todos_summary: 오늘/중요/마감지남/전체 todo 요약
// - search_diaries / search_memos: 검색 (diary.ts의 함수 재사용)
// - propose_memo_block: UI에 본문 삽입 제안 카드

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import {
  searchDiariesTool,
  searchMemosTool,
  runSearchDiaries,
  runSearchMemos,
} from "./diary";

// ---- list_todos_summary ----
export const listTodosSummaryTool: AgentTool = {
  name: "list_todos_summary",
  description:
    "현재 todo 상태 요약. filter: today (오늘 마감) | important (중요) | overdue (마감 지남) | all (전체 미완료). 각 항목은 title + dueDate + tag + isImportant. 최대 20개.",
  input_schema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        enum: ["today", "important", "overdue", "all"],
      },
    },
  },
};

export async function runListTodosSummary(
  userId: string,
  input: Record<string, unknown>,
) {
  const filter = typeof input.filter === "string" ? input.filter : "all";
  const today = new Date().toISOString().slice(0, 10);

  const base = and(
    eq(todos.userId, userId),
    eq(todos.archived, false),
    isNull(todos.completedAt),
  )!;

  const whereClause =
    filter === "today"
      ? and(base, eq(todos.dueDate, today))
      : filter === "important"
        ? and(base, eq(todos.isImportant, true))
        : filter === "overdue"
          ? and(
              base,
              sql`${todos.dueDate} is not null`,
              lte(todos.dueDate, today),
            )
          : base;

  const rows = await db
    .select({
      id: todos.id,
      title: todos.title,
      dueDate: todos.dueDate,
      isImportant: todos.isImportant,
      tag: todos.tag,
    })
    .from(todos)
    .where(whereClause)
    .orderBy(desc(todos.isImportant), asc(todos.dueDate))
    .limit(20);

  return {
    ok: true as const,
    result: { filter, count: rows.length, items: rows },
  };
}

// ---- propose_memo_block ----
export const proposeMemoBlockTool: AgentTool = {
  name: "propose_memo_block",
  description:
    "사용자에게 '이 마크다운 블록을 현재 작성 중인 메모에 추가하시겠어요?' 제안 카드를 띄움. 직접 메모 본문을 수정하지 않음 — 사용자 수락 필요.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string" },
      reason: { type: "string" },
    },
    required: ["content"],
  },
};

export async function runProposeMemoBlock(input: Record<string, unknown>) {
  const content = typeof input.content === "string" ? input.content : "";
  const reason = typeof input.reason === "string" ? input.reason : "";
  if (!content) return { ok: false as const, error: "content required" };
  return {
    ok: true as const,
    result: { proposal: { content, reason } },
  };
}

// ---- export bundle ----
export const memoTools: AgentTool[] = [
  listTodosSummaryTool,
  searchDiariesTool,
  searchMemosTool,
  proposeMemoBlockTool,
];

export async function runMemoTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "list_todos_summary":
      return runListTodosSummary(userId, input);
    case "search_diaries":
      return runSearchDiaries(userId, input);
    case "search_memos":
      return runSearchMemos(userId, input);
    case "propose_memo_block":
      return runProposeMemoBlock(input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}
