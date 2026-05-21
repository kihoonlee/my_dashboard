// GET /api/discussions/[id] — 토론 상세 + 전체 turns (사용자가 "전체 대화 보기" 펼칠 때)

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { agents, discussions, discussionTurns } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  const [d] = await db
    .select()
    .from(discussions)
    .where(and(eq(discussions.id, id), eq(discussions.userId, userId)))
    .limit(1);
  if (!d) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const turns = await db
    .select({
      id: discussionTurns.id,
      round: discussionTurns.round,
      content: discussionTurns.content,
      createdAt: discussionTurns.createdAt,
      speakerAgentId: discussionTurns.speakerAgentId,
      speakerName: agents.name,
      speakerEnglishName: agents.englishName,
    })
    .from(discussionTurns)
    .leftJoin(agents, eq(discussionTurns.speakerAgentId, agents.id))
    .where(eq(discussionTurns.discussionId, id))
    .orderBy(asc(discussionTurns.round), asc(discussionTurns.createdAt));

  return NextResponse.json({ discussion: d, turns });
}
