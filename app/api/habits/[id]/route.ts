// PATCH /api/habits/[id] — name/description/colorHex/archived 갱신
// DELETE /api/habits/[id]

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habits } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    name?: string;
    description?: string | null;
    colorHex?: string | null;
    archived?: boolean;
    targetFrequency?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.colorHex !== undefined) update.colorHex = body.colorHex;
  if (typeof body.archived === "boolean") update.archived = body.archived;
  if (body.targetFrequency !== undefined)
    update.targetFrequency = body.targetFrequency;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const [row] = await db
    .update(habits)
    .set(update)
    .where(eq(habits.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ habit: row });
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
  await db.delete(habits).where(eq(habits.id, id));
  return NextResponse.json({ ok: true });
}
