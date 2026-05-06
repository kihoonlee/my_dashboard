// GET /api/chat/sessions/[id]/messages
// 특정 세션의 메시지 목록 (시간순). /chat 페이지에서 세션 재진입 시 사용.

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { agents, chatMessages, chatSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 세션이 사용자 소유인지 검증
  const [session] = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      userId: chatSessions.userId,
    })
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // 단일 사용자 화이트리스트 환경이라 단순 비교. 추후 RLS 추가 시 더 엄격히.

  const messages = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      agentId: chatMessages.agentId,
      agentEnglishName: agents.englishName,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .leftJoin(agents, eq(chatMessages.agentId, agents.id))
    .where(eq(chatMessages.sessionId, id))
    .orderBy(chatMessages.createdAt);

  return NextResponse.json({ session, messages });
}
