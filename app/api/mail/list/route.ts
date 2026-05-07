// GET /api/mail/list?priority=&includeRead=&limit=
// /mail 페이지 UI용 — gmail_cache 캐시 read-only.

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gmailCache, users } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";

type LastSync = {
  at?: string;
  fetched?: number;
  inserted?: number;
  classified?: number;
  costUsd?: number;
};

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const { searchParams } = new URL(request.url);
  const priority = searchParams.get("priority");
  const includeRead = searchParams.get("includeRead") !== "false";
  const limit = Math.max(
    1,
    Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
  );

  const conditions = [eq(gmailCache.archived, false)];
  if (priority) conditions.push(eq(gmailCache.aiPriority, priority));
  if (!includeRead) conditions.push(eq(gmailCache.read, false));

  const rows = await db
    .select({
      messageId: gmailCache.gmailMessageId,
      threadId: gmailCache.threadId,
      fromEmail: gmailCache.fromEmail,
      fromName: gmailCache.fromName,
      subject: gmailCache.subject,
      snippet: gmailCache.snippet,
      aiPriority: gmailCache.aiPriority,
      needsReply: gmailCache.needsReply,
      aiSummary: gmailCache.aiSummary,
      receivedAt: gmailCache.receivedAt,
      read: gmailCache.read,
    })
    .from(gmailCache)
    .where(and(...conditions))
    .orderBy(desc(gmailCache.receivedAt))
    .limit(limit);

  const [u] = await db
    .select({ settings: users.settingsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const lastSync = ((u?.settings as Record<string, unknown> | null)?.lastGmailSync as
    | LastSync
    | undefined) ?? null;

  return NextResponse.json({ mails: rows, lastSync });
}
