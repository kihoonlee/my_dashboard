// GET /api/todos/today
// 오늘 마감 + 마감 지난 미완료 + 마감일 없는 미완료 Todo를 반환.
// /today 페이지가 호출. 내부적으로는 하영의 list_todos_today tool과 동일 쿼리.

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { and, inArray, isNull, lte, or } from "drizzle-orm";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
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
        or(lte(todos.dueDate, today), isNull(todos.dueDate)),
      ),
    )
    .orderBy(todos.priority, todos.dueDate);

  return NextResponse.json({ todos: rows });
}
