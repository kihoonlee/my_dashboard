// 정연(mail_organizer) 전용 tool 구현체.
// gmail_cache 캐시를 읽어 우선순위별 보고. 신규 메일은 /api/sync/gmail이 별도 채움.
//
// 도구:
//   - list_recent_mails(priority?, limit?, includeRead?): 최근 메일 목록
//   - get_mail(messageId): 단일 메일 메타 + AI 요약
//   - summarize_thread(threadId): Gmail에서 thread 가져와 LLM 요약 (Haiku)

import { db } from "@/lib/db/client";
import { gmailCache } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";
import { ensureUser } from "@/lib/users/ensure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccessTokenForUser, GoogleAuthError } from "@/lib/google/calendar";
import { getThread, header, parseFrom } from "@/lib/google/gmail";
import { summarizeThread } from "@/lib/gmail/classify";

export const JEONGYEON_TOOLS: AgentTool[] = [
  {
    name: "list_recent_mails",
    description:
      "받은편지함의 최근 메일을 우선순위(urgent/important/normal/promotion)와 함께 반환. 캐시에서만 조회 — 새로 가져오려면 사용자가 /mail에서 동기화. 빈 배열이면 사용자에게 동기화 안내.",
    input_schema: {
      type: "object",
      properties: {
        priority: {
          type: "string",
          enum: ["urgent", "important", "normal", "promotion"],
          description: "필터링할 우선순위 (선택)",
        },
        limit: {
          type: "number",
          description: "최대 결과 수 (기본 10, 최대 50)",
        },
        includeRead: {
          type: "boolean",
          description: "읽은 메일도 포함 (기본 true)",
        },
      },
    },
  },
  {
    name: "get_mail",
    description:
      "특정 Gmail 메시지 ID의 메타와 AI 요약을 반환. list_recent_mails 결과의 messageId를 사용.",
    input_schema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Gmail message id" },
      },
      required: ["messageId"],
    },
  },
  {
    name: "summarize_thread",
    description:
      "스레드 ID의 모든 메시지를 Gmail에서 가져와 LLM으로 한국어 요약. 답장 시 다뤄야 할 포인트 포함. Google 권한 필요.",
    input_schema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Gmail thread id" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "count_by_priority",
    description:
      "받은편지함 메일을 우선순위별로 집계 (urgent/important/normal/promotion). 사용자가 '뭐 시급해?' 물을 때 먼저 호출.",
    input_schema: { type: "object", properties: {} },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function runJeongyeonTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "list_recent_mails": {
        const priority = asString(input.priority);
        const includeRead = input.includeRead !== false;
        const limitRaw =
          typeof input.limit === "number"
            ? input.limit
            : parseInt(asString(input.limit) ?? "10", 10);
        const limit = Math.max(1, Math.min(50, limitRaw || 10));

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

        return {
          ok: true,
          result: {
            count: rows.length,
            mails: rows,
            note:
              rows.length === 0
                ? "캐시에 메일이 없습니다. 사용자에게 /mail에서 'Gmail 동기화'를 눌러달라고 안내하세요."
                : undefined,
          },
        };
      }
      case "get_mail": {
        const messageId = asString(input.messageId);
        if (!messageId) return { ok: false, error: "messageId is required" };

        const [row] = await db
          .select()
          .from(gmailCache)
          .where(eq(gmailCache.gmailMessageId, messageId))
          .limit(1);
        if (!row) return { ok: false, error: `mail not found: ${messageId}` };

        return {
          ok: true,
          result: {
            messageId: row.gmailMessageId,
            threadId: row.threadId,
            from: row.fromName
              ? `${row.fromName} <${row.fromEmail ?? ""}>`
              : row.fromEmail,
            subject: row.subject,
            snippet: row.snippet,
            priority: row.aiPriority,
            needsReply: row.needsReply,
            aiSummary: row.aiSummary,
            receivedAt: row.receivedAt,
            read: row.read,
          },
        };
      }
      case "summarize_thread": {
        const threadId = asString(input.threadId);
        if (!threadId) return { ok: false, error: "threadId is required" };

        // Gmail API 호출 — server-side에서 Supabase 세션으로 user 식별
        const supabase = await createSupabaseServerClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: "unauthorized (no session)" };
        const userId = await ensureUser(user);

        let accessToken: string;
        try {
          accessToken = await getAccessTokenForUser(userId);
        } catch (e) {
          if (e instanceof GoogleAuthError && e.needsReauth) {
            return {
              ok: false,
              error: `Google 권한 만료. 사용자에게 /auth/login 재로그인 안내. ${e.message}`,
            };
          }
          throw e;
        }

        const thread = await getThread({ accessToken, threadId });
        const msgs = thread.messages.map((m) => {
          const fromHeader = header(m, "From");
          const { name, email } = parseFrom(fromHeader);
          return {
            from: name ? `${name} <${email ?? ""}>` : (email ?? ""),
            subject: header(m, "Subject") ?? "",
            snippet: m.snippet ?? "",
            date: header(m, "Date") ?? "",
          };
        });

        const r = await summarizeThread({ threadId, messages: msgs });
        return {
          ok: true,
          result: {
            threadId,
            messageCount: thread.messages.length,
            summary: r.summary,
            costUsd: r.costUsd,
          },
        };
      }
      case "count_by_priority": {
        const rows = await db.execute<{ priority: string; cnt: number }>(sql`
          SELECT
            COALESCE(ai_priority, 'unclassified') AS priority,
            COUNT(*)::int AS cnt
          FROM gmail_cache
          WHERE archived = false
          GROUP BY priority
        `);
        const counts: Record<string, number> = {
          urgent: 0,
          important: 0,
          normal: 0,
          promotion: 0,
          unclassified: 0,
        };
        for (const r of rows as unknown as Array<{
          priority: string;
          cnt: number;
        }>) {
          counts[r.priority] = r.cnt;
        }
        return { ok: true, result: counts };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `jeongyeon tool error: ${message}` };
  }
}
