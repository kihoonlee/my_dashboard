// PATCH /api/goals/[id]   body: { progress? (0-100), status?, title?, description?, targetDate? }
// DELETE /api/goals/[id]

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { goals } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_STATUS = new Set(["active", "done", "paused"]);

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

  let body: {
    progress?: number;
    status?: string;
    title?: string;
    description?: string;
    targetDate?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.progress === "number") {
    update.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
  }
  if (body.status && ALLOWED_STATUS.has(body.status)) update.status = body.status;
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.targetDate !== undefined) update.targetDate = body.targetDate;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const [row] = await db
    .update(goals)
    .set(update)
    .where(eq(goals.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ goal: row });
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
  await db.delete(goals).where(eq(goals.id, id));
  return NextResponse.json({ ok: true });
}
