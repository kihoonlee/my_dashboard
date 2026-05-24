// PATCH  /api/todos/[id] — { title?, notes?, dueDate?, isImportant?, tag?, archived?, completed? }
//   completed=true면 completed_at=now, false면 null.
// DELETE /api/todos/[id]

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  let body: {
    title?: string;
    notes?: string | null;
    dueDate?: string | null;
    isImportant?: boolean;
    tag?: string | null;
    archived?: boolean;
    completed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) update.title = body.title;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.dueDate !== undefined) {
    update.dueDate =
      body.dueDate === null || /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate ?? "")
        ? body.dueDate
        : null;
  }
  if (body.isImportant !== undefined) update.isImportant = body.isImportant;
  if (body.tag !== undefined) update.tag = body.tag;
  if (body.archived !== undefined) update.archived = body.archived;
  if (body.completed !== undefined) {
    update.completedAt = body.completed ? new Date() : null;
  }

  const [row] = await db
    .update(todos)
    .set(update)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  const result = await db
    .delete(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .returning({ id: todos.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
