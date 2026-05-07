// PATCH  /api/read-later/[id] — { status?, priority?, tags? }
// DELETE /api/read-later/[id]

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { readLater } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VALID_STATUS = new Set(["unread", "read", "archived"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: { status?: string; priority?: string; tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.status && VALID_STATUS.has(body.status)) {
    update.status = body.status;
    if (body.status === "read") update.readAt = new Date();
  }
  if (body.priority) update.priority = body.priority;
  if (Array.isArray(body.tags))
    update.tags = body.tags.filter((t) => typeof t === "string");
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const [row] = await db
    .update(readLater)
    .set(update)
    .where(eq(readLater.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ item: row });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await db.delete(readLater).where(eq(readLater.id, id));
  return NextResponse.json({ ok: true });
}
