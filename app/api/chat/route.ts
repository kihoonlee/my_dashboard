// POST /api/chat
// 민지 메인 채팅 엔드포인트.
// body: { sessionId?: string, message: string }
//
// 흐름:
// 1. Supabase 세션 → public.users 매핑 보장 (없으면 upsert)
// 2. sessionId 없으면 새 chat_session 생성
// 3. user 메시지를 chat_messages.insert
// 4. 내부적으로 /api/agents/minji/invoke 호출 (메시지 = 사용자 입력)
// 5. assistant 응답을 chat_messages.insert (agentId=민지)
// 6. 세션의 last_message_at 갱신, 응답 반환
//
// 응답: { sessionId, userMessageId, assistantMessageId, text, costUsd, durationMs }

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { agents, chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function ensureUser(supabaseUser: {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string; name?: string } | null;
}): Promise<string> {
  // public.users.id를 supabase auth user id에 정렬. email unique 사용.
  const email = supabaseUser.email ?? `${supabaseUser.id}@unknown.local`;
  const name =
    supabaseUser.user_metadata?.full_name ??
    supabaseUser.user_metadata?.name ??
    null;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({ email, name })
    .returning({ id: users.id });
  return created.id;
}

export async function POST(request: NextRequest) {
  // 1. body 파싱
  let body: { sessionId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userMessageText = body.message?.trim();
  if (!userMessageText) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 },
    );
  }

  // 2. 인증 사용자 확인
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await ensureUser(authUser);

  // 3. 세션 결정 (없으면 신규)
  let sessionId = body.sessionId;
  if (!sessionId) {
    const [created] = await db
      .insert(chatSessions)
      .values({
        userId,
        title:
          userMessageText.length > 40
            ? userMessageText.slice(0, 40) + "..."
            : userMessageText,
      })
      .returning({ id: chatSessions.id });
    sessionId = created.id;
  } else {
    // 세션 존재 검증 + 소유자 확인
    const [s] = await db
      .select({ id: chatSessions.id, userId: chatSessions.userId })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    if (!s || s.userId !== userId) {
      return NextResponse.json(
        { error: "session_not_found" },
        { status: 404 },
      );
    }
  }

  // 4. 사용자 메시지 저장
  const [userMsg] = await db
    .insert(chatMessages)
    .values({
      sessionId,
      role: "user",
      content: userMessageText,
    })
    .returning({ id: chatMessages.id });

  // 5. 민지 invoke 호출 (내부 호출 — depth 0에서 시작)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const startedAt = Date.now();
  const invokeRes = await fetch(`${baseUrl}/api/agents/minji/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-myhub-internal-call": "1",
      "x-myhub-agent-depth": "0",
    },
    body: JSON.stringify({ message: userMessageText, trigger: "chat" }),
  });
  const invokeData = await invokeRes.json();
  if (!invokeRes.ok) {
    // 실패 응답도 chat_messages에 기록 (회복용)
    await db.insert(chatMessages).values({
      sessionId,
      role: "assistant",
      content: `(에러: ${invokeData?.error ?? invokeRes.statusText})`,
    });
    return NextResponse.json(
      { error: invokeData?.error ?? "invoke_failed", sessionId },
      { status: invokeRes.status },
    );
  }

  // 6. 민지 agent id 조회 (assistant 메시지에 첨부)
  const [minjiAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.englishName, "minji"))
    .limit(1);

  const [assistantMsg] = await db
    .insert(chatMessages)
    .values({
      sessionId,
      role: "assistant",
      content: invokeData.text || "(빈 응답)",
      agentId: minjiAgent?.id ?? null,
      // tool_calls는 추후 invoke route에서 함께 전달받도록 확장 예정 — 현재는 null
    })
    .returning({ id: chatMessages.id });

  // 7. 세션 last_message_at 갱신
  await db
    .update(chatSessions)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatSessions.id, sessionId));

  return NextResponse.json({
    sessionId,
    userMessageId: userMsg.id,
    assistantMessageId: assistantMsg.id,
    text: invokeData.text,
    costUsd: invokeData.costUsd,
    durationMs: Date.now() - startedAt,
    iterations: invokeData.iterations,
    usage: invokeData.usage,
  });
}
