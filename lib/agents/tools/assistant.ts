// 보조 에이전트(민지) 전용 도구.
// - get_user_context: 사용자 최근 일기/메모/todo 패턴 요약 (사용자 컨텍스트 마스터 역할)
// - web_search: main과 동일한 server tool wrapper (재사용)

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { diaryEntries, memos, todos } from "@/lib/db/schema";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { webSearchTool, runWebSearch } from "./main";

// ---- get_user_context ----
export const getUserContextTool: AgentTool = {
  name: "get_user_context",
  description:
    "사용자의 최근 일기(최근 7개), 최근 메모(최근 10개), 미완료/중요 todo, 이번주 활동 통계를 요약. 보조 에이전트가 사용자 상태를 빠르게 파악할 때 사용.",
  input_schema: {
    type: "object",
    properties: {
      diary_days: {
        type: "integer",
        description: "일기 조회 기간(일, 기본 14)",
      },
    },
  },
};

export async function runGetUserContext(
  userId: string,
  input: Record<string, unknown>,
) {
  const diaryDays =
    typeof input.diary_days === "number" && input.diary_days > 0
      ? Math.min(60, Math.floor(input.diary_days))
      : 14;

  const since = new Date(Date.now() - diaryDays * 24 * 60 * 60 * 1000);
  const sinceDateStr = since.toISOString().slice(0, 10);

  const recentDiaries = await db
    .select({
      entryDate: diaryEntries.entryDate,
      title: diaryEntries.title,
      bodyMd: diaryEntries.bodyMd,
      mood: diaryEntries.mood,
    })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        gte(diaryEntries.entryDate, sinceDateStr),
      ),
    )
    .orderBy(desc(diaryEntries.entryDate))
    .limit(7);

  const recentMemos = await db
    .select({
      id: memos.id,
      entryDate: memos.entryDate,
      title: memos.title,
      bodyMd: memos.bodyMd,
    })
    .from(memos)
    .where(and(eq(memos.userId, userId), eq(memos.archived, false)))
    .orderBy(desc(memos.entryDate), desc(memos.createdAt))
    .limit(10);

  const importantTodos = await db
    .select({
      id: todos.id,
      title: todos.title,
      dueDate: todos.dueDate,
      isImportant: todos.isImportant,
      tag: todos.tag,
    })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.archived, false),
        isNull(todos.completedAt),
        or(eq(todos.isImportant, true), gte(todos.dueDate, sinceDateStr)),
      ),
    )
    .orderBy(desc(todos.isImportant), todos.dueDate)
    .limit(15);

  const [stats] = await db
    .select({
      completedThisWeek: sql<number>`coalesce(count(*) filter (where ${todos.completedAt} is not null and ${todos.completedAt} >= now() - interval '7 days'), 0)::int`,
      pending: sql<number>`coalesce(count(*) filter (where ${todos.completedAt} is null and ${todos.archived} = false), 0)::int`,
    })
    .from(todos)
    .where(eq(todos.userId, userId));

  return {
    ok: true as const,
    result: {
      diaries: {
        count: recentDiaries.length,
        items: recentDiaries.map((d) => ({
          date: d.entryDate,
          title: d.title,
          // 본문은 첫 200자만 (LLM 토큰 절약)
          excerpt: d.bodyMd.slice(0, 200),
          mood: d.mood,
        })),
      },
      memos: {
        count: recentMemos.length,
        items: recentMemos.map((m) => ({
          id: m.id,
          date: m.entryDate,
          title: m.title,
          excerpt: m.bodyMd.slice(0, 200),
        })),
      },
      todos: {
        count: importantTodos.length,
        items: importantTodos,
      },
      stats: {
        completedThisWeek: stats?.completedThisWeek ?? 0,
        pending: stats?.pending ?? 0,
      },
    },
  };
}

// ---- export bundle ----
export const assistantTools: AgentTool[] = [getUserContextTool, webSearchTool];

export async function runAssistantTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "get_user_context":
      return runGetUserContext(userId, input);
    case "web_search":
      return runWebSearch(input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}
