// PATCH  /api/captures/[id] — body { action: "categorize" | "move", target?: "todo"|"read_later"|"learning" }
// DELETE /api/captures/[id]

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learnings, quickCaptures, readLater, todos } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categorizeCapture } from "@/lib/captures/categorize";

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

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

  let body: { action?: string; target?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const [cap] = await db
    .select()
    .from(quickCaptures)
    .where(eq(quickCaptures.id, id))
    .limit(1);
  if (!cap) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.action === "categorize") {
    const r = await categorizeCapture({
      content: cap.content,
      url: cap.url,
    });
    await db
      .update(quickCaptures)
      .set({ aiCategory: r.category })
      .where(eq(quickCaptures.id, id));
    return NextResponse.json({
      ok: true,
      category: r.category,
      summary: r.summary,
      confidence: r.confidence,
      costUsd: r.costUsd,
    });
  }

  if (body.action === "move") {
    const target = body.target;
    if (!target) {
      return NextResponse.json({ error: "target required" }, { status: 400 });
    }
    let movedToTable = "";
    let movedToId: string | null = null;

    if (target === "todo") {
      const [t] = await db
        .insert(todos)
        .values({
          title: cap.content.slice(0, 200),
          priority: "P2",
          status: "todo",
        })
        .returning({ id: todos.id });
      movedToTable = "todos";
      movedToId = t?.id ?? null;
    } else if (target === "read_later") {
      if (!cap.url) {
        return NextResponse.json(
          { error: "URL이 없는 캡처는 read_later로 이동 불가" },
          { status: 400 },
        );
      }
      const [r] = await db
        .insert(readLater)
        .values({
          url: cap.url,
          title: cap.content.slice(0, 200),
          domain: extractDomain(cap.url),
          status: "unread",
        })
        .returning({ id: readLater.id });
      movedToTable = "read_later";
      movedToId = r?.id ?? null;
    } else if (target === "learning") {
      const [l] = await db
        .insert(learnings)
        .values({ content: cap.content })
        .returning({ id: learnings.id });
      movedToTable = "learnings";
      movedToId = l?.id ?? null;
    } else {
      return NextResponse.json({ error: `unknown target: ${target}` }, { status: 400 });
    }

    await db
      .update(quickCaptures)
      .set({ processed: true, movedToTable, movedToId })
      .where(eq(quickCaptures.id, id));
    return NextResponse.json({ ok: true, movedToTable, movedToId });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
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
  await db.delete(quickCaptures).where(eq(quickCaptures.id, id));
  return NextResponse.json({ ok: true });
}
