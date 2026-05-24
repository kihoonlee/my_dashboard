// GET /api/chat/sessions — 사용자 채팅 세션 리스트.
// query:
//   - agent: 영문명 (optional) — 해당 에이전트와의 세션만 (chat second-column에서 사용)
//   - q: 검색어 (optional) — title 부분 일치 (ilike, 케이스 무시)
//   - limit: 기본 50, 최대 200
//
// hidden=true 세션은 노출 안 함 (사이드패널 임시 세션).
// 정렬: lastMessageAt DESC.

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agents, chatSessions } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(authUser);

  const url = request.nextUrl;
  const agentParam = url.searchParams.get("agent");
  const qParam = url.searchParams.get("q");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  // agent 필터: 영문명 → agent.id 해결
  let agentIdFilter: string | null = null;
  if (agentParam) {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, agentParam))
      .limit(1);
    if (!a) {
      // 알 수 없는 agent는 빈 결과 (404 대신 안전한 빈 응답)
      return NextResponse.json({ sessions: [] });
    }
    agentIdFilter = a.id;
  }

  const conditions = [
    eq(chatSessions.userId, userId),
    eq(chatSessions.hidden, false),
  ];
  if (agentIdFilter) {
    conditions.push(eq(chatSessions.agentId, agentIdFilter));
  }
  if (qParam && qParam.trim().length > 0) {
    conditions.push(ilike(chatSessions.title, `%${qParam.trim()}%`));
  }

  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      agentEnglishName: agents.englishName,
      lastMessageAt: chatSessions.lastMessageAt,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .leftJoin(agents, eq(chatSessions.agentId, agents.id))
    .where(and(...conditions))
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(limit);

  return NextResponse.json({ sessions: rows });
}
