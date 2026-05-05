// POST /api/todos/[id]/complete
// 체크박스 클릭 시 호출. 하영의 complete_todo tool과 동일 동작이지만 LLM 호출 없는 직접 경로.

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [updated] = await db
    .update(todos)
    .set({
      status: "done",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(todos.id, id))
    .returning({
      id: todos.id,
      status: todos.status,
      completedAt: todos.completedAt,
    });
  if (!updated) {
    return NextResponse.json({ error: "todo_not_found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
