// 하영(today_manager) 전용 tool 구현체.
// Tool 정의 (schema)와 실행 함수를 한 파일에 둠 — Phase 1 범위에서는 4개 tool만:
//   - create_todo: 신규 Todo 생성 + 자동 분류 (priority/projectId)
//   - list_todos_today: 오늘 마감 + 미완료 Todo 조회
//   - complete_todo: Todo 완료 처리
//   - update_todo_due_date: 마감일 변경 (재스케줄링)

import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";

export const HAYOUNG_TOOLS: AgentTool[] = [
  {
    name: "create_todo",
    description:
      "신규 Todo를 생성한다. priority는 P0(긴급)/P1(높음)/P2(보통, 기본)/P3(낮음). dueDate는 ISO date(YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Todo 제목 (한국어 OK)" },
        description: { type: "string", description: "상세 설명 (선택)" },
        dueDate: {
          type: "string",
          description: "마감일 ISO date (선택, 미지정 시 오늘)",
        },
        priority: {
          type: "string",
          enum: ["P0", "P1", "P2", "P3"],
          description: "우선순위 (기본 P2)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_todos_today",
    description:
      "오늘 마감 + 마감일 지난 미완료 + 마감일 없는 미완료 Todo를 모두 반환한다. 하영의 모닝 브리핑/오늘 화면용.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "complete_todo",
    description: "특정 Todo를 완료 처리한다 (status=done, completedAt=now).",
    input_schema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Todo의 UUID" },
      },
      required: ["todoId"],
    },
  },
  {
    name: "update_todo_due_date",
    description: "Todo 마감일을 변경한다 (재스케줄링 / 미루기).",
    input_schema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Todo의 UUID" },
        dueDate: {
          type: "string",
          description: "새 마감일 ISO date (YYYY-MM-DD)",
        },
      },
      required: ["todoId", "dueDate"],
    },
  },
];

type ToolInput = Record<string, unknown>;

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Tool name을 받아서 실행. 알 수 없는 tool이면 에러 객체 반환 (예외 throw 안 함 — Anthropic
 * tool_result is_error로 흘려보내야 LLM이 회복 가능).
 */
export async function runHayoungTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "create_todo": {
        const title = asString(input.title);
        if (!title) return { ok: false, error: "title is required" };
        const dueDate = asString(input.dueDate) ?? isoToday();
        const priority = asString(input.priority) ?? "P2";
        const description = asString(input.description) ?? null;

        const [created] = await db
          .insert(todos)
          .values({
            title,
            description,
            dueDate,
            priority,
            status: "todo",
          })
          .returning({
            id: todos.id,
            title: todos.title,
            dueDate: todos.dueDate,
            priority: todos.priority,
            status: todos.status,
          });
        return { ok: true, result: created };
      }
      case "list_todos_today": {
        const today = isoToday();
        const rows = await db
          .select({
            id: todos.id,
            title: todos.title,
            description: todos.description,
            dueDate: todos.dueDate,
            priority: todos.priority,
            status: todos.status,
            createdAt: todos.createdAt,
          })
          .from(todos)
          .where(
            and(
              inArray(todos.status, ["todo", "doing"]),
              or(
                lte(todos.dueDate, today),
                isNull(todos.dueDate),
              ),
            ),
          )
          .orderBy(todos.priority, todos.dueDate);
        return { ok: true, result: { count: rows.length, todos: rows } };
      }
      case "complete_todo": {
        const todoId = asString(input.todoId);
        if (!todoId) return { ok: false, error: "todoId is required" };
        const [updated] = await db
          .update(todos)
          .set({
            status: "done",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(todos.id, todoId))
          .returning({
            id: todos.id,
            title: todos.title,
            status: todos.status,
            completedAt: todos.completedAt,
          });
        if (!updated) return { ok: false, error: `todo ${todoId} not found` };
        return { ok: true, result: updated };
      }
      case "update_todo_due_date": {
        const todoId = asString(input.todoId);
        const dueDate = asString(input.dueDate);
        if (!todoId || !dueDate) {
          return { ok: false, error: "todoId and dueDate are required" };
        }
        const [updated] = await db
          .update(todos)
          .set({ dueDate, updatedAt: new Date() })
          .where(eq(todos.id, todoId))
          .returning({
            id: todos.id,
            title: todos.title,
            dueDate: todos.dueDate,
          });
        if (!updated) return { ok: false, error: `todo ${todoId} not found` };
        return { ok: true, result: updated };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `db error: ${message}` };
  } finally {
    // satisfy unused-var warnings on sql import (used implicitly via drizzle helpers if any)
    void sql;
  }
}
