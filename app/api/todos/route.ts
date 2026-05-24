// GET  /api/todos?filter=today|important|overdue|archived|completed|all
// POST /api/todos — { title, notes?, dueDate?, isImportant?, tag? }

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { todos } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const filter = new URL(request.url).searchParams.get("filter") ?? "all";
  const today = new Date().toISOString().slice(0, 10);

  const base = eq(todos.userId, userId);
  let where;
  switch (filter) {
    case "today":
      where = and(
        base,
        eq(todos.archived, false),
        isNull(todos.completedAt),
        eq(todos.dueDate, today),
      );
      break;
    case "important":
      where = and(
        base,
        eq(todos.archived, false),
        isNull(todos.completedAt),
        eq(todos.isImportant, true),
      );
      break;
    case "overdue":
      where = and(
        base,
        eq(todos.archived, false),
        isNull(todos.completedAt),
        sql`${todos.dueDate} is not null`,
        lte(todos.dueDate, today),
      );
      break;
    case "archived":
      where = and(base, eq(todos.archived, true));
      break;
    case "completed":
      where = and(base, sql`${todos.completedAt} is not null`);
      break;
    case "all":
    default:
      where = and(base, eq(todos.archived, false), isNull(todos.completedAt));
      break;
  }

  const rows = await db
    .select()
    .from(todos)
    .where(where)
    .orderBy(
      desc(todos.isImportant),
      asc(todos.dueDate),
      desc(todos.createdAt),
    )
    .limit(200);

  return NextResponse.json({ filter, count: rows.length, items: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: {
    title?: string;
    notes?: string;
    dueDate?: string;
    isImportant?: boolean;
    tag?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const dueDate =
    body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
      ? body.dueDate
      : null;

  const [row] = await db
    .insert(todos)
    .values({
      userId,
      title,
      notes: body.notes ?? null,
      dueDate,
      isImportant: !!body.isImportant,
      tag: body.tag ?? null,
    })
    .returning();
  return NextResponse.json(row);
}
