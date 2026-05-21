// GET    /api/memos/[id]
// PATCH  /api/memos/[id] — { title?, bodyMd?, pinned?, archived? }
// DELETE /api/memos/[id]

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { memos } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  const [row] = await db
    .select()
    .from(memos)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  let body: {
    title?: string | null;
    bodyMd?: string;
    pinned?: boolean;
    archived?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) update.title = body.title;
  if (body.bodyMd !== undefined) update.bodyMd = body.bodyMd;
  if (body.pinned !== undefined) update.pinned = body.pinned;
  if (body.archived !== undefined) update.archived = body.archived;

  const [row] = await db
    .update(memos)
    .set(update)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
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
    .delete(memos)
    .where(and(eq(memos.id, id), eq(memos.userId, userId)))
    .returning({ id: memos.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
