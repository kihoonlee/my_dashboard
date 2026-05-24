// POST /api/chat
// 멀티 에이전트 채팅 엔드포인트 — SSE 스트리밍 응답.
//
// body: { sessionId?: string, message: string, agent?: string }
//   agent — 영문명 (main/assistant/daily/diary/memo/calendar). 기본 "main".
//
// 흐름:
// 1. Supabase 세션 → public.users 매핑 보장 (없으면 upsert)
// 2. sessionId 없으면 새 chat_session 생성
// 3. user 메시지를 chat_messages.insert
// 4. /api/agents/minji/invoke 에 Accept: text/event-stream 으로 호출 → 받은 SSE를 forward
//    `done` 이벤트는 가로채 fullText로 chat_messages.insert 후 assistantMessageId 추가해 emit
// 5. 세션의 last_message_at 갱신
//
// SSE 이벤트:
//   session: { sessionId, userMessageId }
//   delta:   { text } (forward)
//   tool_call / tool_result / iteration (forward)
//   error:   { message }
//   done:    { fullText, assistantMessageId, agentLogId, iterations, durationMs, costUsd, usage, isError }

import { type NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db/client";
import { agents, chatMessages, chatSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { requestOrigin } from "@/lib/http/origin";

type Attachment = {
  type: "image";
  storagePath: string;
  bucket?: string;
  contentType: string;
  fileName: string;
};


function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALLOWED_AGENTS = new Set([
  "main",
  "assistant",
  "daily",
  "diary",
  "memo",
  "calendar",
]);

export async function POST(request: NextRequest) {
  let body: {
    sessionId?: string;
    message?: string;
    agent?: string;
    attachments?: Attachment[];
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const userMessageText = body.message?.trim() ?? "";
  const attachments: Attachment[] = Array.isArray(body.attachments)
    ? body.attachments.filter(
        (a): a is Attachment =>
          !!a &&
          a.type === "image" &&
          typeof a.storagePath === "string" &&
          typeof a.contentType === "string",
      )
    : [];
  if (!userMessageText && attachments.length === 0) {
    return jsonError("message or attachments required", 400);
  }
  const agentName =
    body.agent && ALLOWED_AGENTS.has(body.agent) ? body.agent : "main";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return jsonError("unauthorized", 401);

  const userId = await ensureUser(authUser);

  // 선택된 에이전트의 id (chat_sessions.agentId 영속화용)
  const [selectedAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.englishName, agentName))
    .limit(1);

  let sessionId = body.sessionId;
  if (!sessionId) {
    const [created] = await db
      .insert(chatSessions)
      .values({
        userId,
        agentId: selectedAgent?.id ?? null,
        title:
          userMessageText.length > 40
            ? userMessageText.slice(0, 40) + "..."
            : userMessageText,
      })
      .returning({ id: chatSessions.id });
    sessionId = created.id;
  } else {
    const [s] = await db
      .select({ id: chatSessions.id, userId: chatSessions.userId })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    if (!s || s.userId !== userId) {
      return jsonError("session_not_found", 404);
    }
  }

  const [userMsg] = await db
    .insert(chatMessages)
    .values({
      sessionId,
      role: "user",
      content: userMessageText,
      attachments,
    })
    .returning({ id: chatMessages.id });

  // 첨부 이미지가 있으면 supabase storage에서 다운로드 → base64 embed.
  // signed URL 방식은 Anthropic이 fetch 단계에서 "Could not process image" 거부하는
  // 케이스 있어 base64로 inline (Anthropic vision은 base64 source 가장 안정적).
  let messageContent: Anthropic.ContentBlockParam[] | null = null;
  if (attachments.length > 0) {
    const supabase = await createSupabaseServerClient();
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const att of attachments) {
      const bucket = att.bucket ?? "diary";
      const { data: blob, error } = await supabase.storage
        .from(bucket)
        .download(att.storagePath);
      if (error || !blob) {
        return jsonError(
          `attachment_download_failed: ${att.storagePath}`,
          500,
        );
      }
      const ab = await blob.arrayBuffer();
      const base64 = Buffer.from(ab).toString("base64");
      const mediaType = (att.contentType || "image/png") as
        | "image/png"
        | "image/jpeg"
        | "image/gif"
        | "image/webp";
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });
    }
    if (userMessageText) {
      blocks.push({ type: "text", text: userMessageText });
    }
    messageContent = blocks;
  }

  // self-fetch: NEXT_PUBLIC_APP_URL은 빌드 타임에 박혀 prod/dev 포트 불일치 위험.
  // request의 Host 헤더로 자기 origin 호출 (lib/http/origin.ts 패턴, daily-8am과 동일).
  const baseUrl = requestOrigin(request);
  const upstream = await fetch(`${baseUrl}/api/agents/${agentName}/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-myhub-internal-call": "1",
      "x-myhub-agent-depth": "0",
      "x-myhub-user-id": userId,
    },
    body: JSON.stringify({
      ...(messageContent
        ? { messageContent }
        : { message: userMessageText }),
      trigger: "chat",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errPayload = await upstream.text().catch(() => "");
    await db.insert(chatMessages).values({
      sessionId,
      role: "assistant",
      content: `(에러: ${upstream.status} ${upstream.statusText})`,
    });
    return jsonError(errPayload || `upstream_${upstream.status}`, 502);
  }

  const sId = sessionId;
  const userMsgId = userMsg.id;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      }
      function passthrough(eventName: string, dataStr: string) {
        controller.enqueue(
          encoder.encode(`event: ${eventName}\ndata: ${dataStr}\n\n`),
        );
      }

      emit("session", { sessionId: sId, userMessageId: userMsgId });

      const reader = upstream.body!.getReader();
      let buffer = "";
      let assistantText = "";
      let isError = false;
      let errorMessage: string | null = null;
      let doneData: Record<string, unknown> | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventName = "message";
            let dataStr = "";
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataStr += line.slice(6);
            }

            if (eventName === "done") {
              try {
                const parsed = JSON.parse(dataStr) as {
                  fullText?: string;
                  isError?: boolean;
                };
                doneData = parsed as Record<string, unknown>;
                assistantText = parsed.fullText ?? "";
                isError = !!parsed.isError;
              } catch {
                doneData = null;
              }
              // done은 chat route가 가공해서 마지막에 emit
            } else if (eventName === "error") {
              try {
                const parsed = JSON.parse(dataStr) as { message?: string };
                errorMessage = parsed.message ?? "unknown";
              } catch {
                errorMessage = "unknown";
              }
              passthrough(eventName, dataStr);
            } else {
              passthrough(eventName, dataStr);
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emit("error", { message: msg });
        errorMessage = msg;
        isError = true;
      }

      // assistant 메시지 영속화 + lastMessageAt 갱신
      let assistantMessageId: string | undefined;
      try {
        const fallback = isError
          ? `(에러: ${errorMessage ?? "unknown"})`
          : "(빈 응답)";
        const [assistantMsg] = await db
          .insert(chatMessages)
          .values({
            sessionId: sId,
            role: "assistant",
            content: assistantText || fallback,
            agentId: selectedAgent?.id ?? null,
          })
          .returning({ id: chatMessages.id });
        assistantMessageId = assistantMsg.id;

        await db
          .update(chatSessions)
          .set({ lastMessageAt: new Date() })
          .where(eq(chatSessions.id, sId));
      } catch (e) {
        console.error("[chat] persist failed:", e);
      }

      emit("done", {
        ...(doneData ?? {}),
        assistantMessageId,
        sessionId: sId,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
