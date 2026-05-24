// GET  /api/discussions — 토론 리스트 (최신순, 최대 50)
// POST /api/discussions — 수동 토론 시작 (디버그용; 메인 에이전트의 start_discussion 도구가 일반 경로)
//   body: { topic: string, targetAgents: string[] }

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { discussions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/api/auth";
import { startDiscussion } from "@/lib/discussions/runner";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const rows = await db
    .select({
      id: discussions.id,
      topic: discussions.topic,
      status: discussions.status,
      summaryMd: discussions.summaryMd,
      roundsRun: discussions.roundsRun,
      startedAt: discussions.startedAt,
      completedAt: discussions.completedAt,
    })
    .from(discussions)
    .where(eq(discussions.userId, userId))
    .orderBy(desc(discussions.startedAt))
    .limit(50);

  return NextResponse.json({ count: rows.length, items: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: { topic?: string; targetAgents?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const topic = body.topic?.trim();
  const targets = Array.isArray(body.targetAgents)
    ? body.targetAgents.filter((x) => typeof x === "string")
    : [];
  if (!topic || targets.length === 0) {
    return NextResponse.json(
      { error: "topic and targetAgents required" },
      { status: 400 },
    );
  }

  const id = await startDiscussion({ userId, topic, targetAgents: targets });
  return NextResponse.json({ id });
}
