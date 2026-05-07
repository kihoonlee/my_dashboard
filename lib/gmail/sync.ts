// Gmail 받은편지함 → gmail_cache 동기화 + AI 우선순위 분류 (정연).
//
// 흐름:
// 1. listMessages — 최근 N건 ID 목록 (q="in:inbox -category:promotions newer_than:7d" 기본)
// 2. 신규 ID만 추출 (DB 기존 gmailMessageId diff)
// 3. getMessageMeta로 헤더+snippet (label 포함) 가져와 gmail_cache upsert
// 4. 분류되지 않은(aiPriority IS NULL) 행 N개 → classifyMails 배치 호출 → 행 update
// 5. agent_logs (정연 agent_id) + users.settings_json.lastGmailSync 기록

import "server-only";
import { eq, sql, and, isNull, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agents, agentLogs, gmailCache, users } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";
import {
  getMessageMeta,
  header,
  listMessages,
  parseFrom,
} from "@/lib/google/gmail";
import { classifyMails, CLASSIFY_META } from "@/lib/gmail/classify";

const DEFAULT_QUERY = "in:inbox -category:promotions newer_than:7d";
const FETCH_LIMIT = 30;
const CLASSIFY_LIMIT = 20; // 한 sync에 분류할 메일 최대치 (비용 가드)

export type GmailSyncSummary = {
  fetched: number;
  inserted: number;
  classified: number;
  llmCalls: number;
  totalCostUsd: number;
  errors: string[];
  durationMs: number;
};

export async function syncGmailInbox(params: {
  userId: string;
  accessToken: string;
  query?: string;
  fetchLimit?: number;
}): Promise<GmailSyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const fetchLimit = Math.max(1, Math.min(100, params.fetchLimit ?? FETCH_LIMIT));

  let jeongyeonAgentId: string | null = null;
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "jeongyeon"))
      .limit(1);
    jeongyeonAgentId = a?.id ?? null;
  } catch (e) {
    errors.push(`jeongyeon agent lookup failed: ${errMsg(e)}`);
  }

  // ── 1. 메시지 ID 목록 ────────────────────────────────────
  let listResp;
  try {
    listResp = await listMessages({
      accessToken: params.accessToken,
      q: params.query ?? DEFAULT_QUERY,
      maxResults: fetchLimit,
    });
  } catch (e) {
    return {
      fetched: 0,
      inserted: 0,
      classified: 0,
      llmCalls: 0,
      totalCostUsd: 0,
      errors: [`listMessages failed: ${errMsg(e)}`],
      durationMs: Date.now() - startedAt,
    };
  }

  const messageRefs = listResp.messages ?? [];
  if (messageRefs.length === 0) {
    return {
      fetched: 0,
      inserted: 0,
      classified: 0,
      llmCalls: 0,
      totalCostUsd: 0,
      errors,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── 2. 기존 ID diff ─────────────────────────────────────
  const ids = messageRefs.map((m) => m.id);
  const existing = await db
    .select({ id: gmailCache.gmailMessageId })
    .from(gmailCache)
    .where(inArray(gmailCache.gmailMessageId, ids));
  const existingSet = new Set(existing.map((r) => r.id));
  const newRefs = messageRefs.filter((r) => !existingSet.has(r.id));

  console.log(
    `[gmail/sync] total=${messageRefs.length} existing=${existing.length} new=${newRefs.length}`,
  );

  // ── 3. 신규 메시지 메타 fetch + upsert ─────────────────
  let inserted = 0;
  for (const ref of newRefs) {
    try {
      const meta = await getMessageMeta({
        accessToken: params.accessToken,
        messageId: ref.id,
      });
      const subject = header(meta, "Subject") ?? "";
      const fromHeader = header(meta, "From");
      const { name, email } = parseFrom(fromHeader);
      const internal = meta.internalDate ? Number(meta.internalDate) : Date.now();
      const labels = meta.labelIds ?? [];
      const isUnread = labels.includes("UNREAD");

      await db
        .insert(gmailCache)
        .values({
          gmailMessageId: meta.id,
          threadId: meta.threadId,
          fromEmail: email,
          fromName: name,
          subject,
          snippet: meta.snippet ?? null,
          receivedAt: new Date(internal),
          read: !isUnread,
        })
        .onConflictDoNothing({ target: gmailCache.gmailMessageId });
      inserted += 1;
    } catch (e) {
      errors.push(`message ${ref.id}: ${errMsg(e)}`);
    }
  }

  // ── 4. 분류되지 않은 행 → 배치 LLM ────────────────────
  const unclassified = await db
    .select({
      id: gmailCache.id,
      gmailMessageId: gmailCache.gmailMessageId,
      subject: gmailCache.subject,
      fromName: gmailCache.fromName,
      fromEmail: gmailCache.fromEmail,
      snippet: gmailCache.snippet,
    })
    .from(gmailCache)
    .where(isNull(gmailCache.aiPriority))
    .orderBy(desc(gmailCache.receivedAt))
    .limit(CLASSIFY_LIMIT);

  let classified = 0;
  let llmCalls = 0;
  let totalCostUsd = 0;
  if (unclassified.length > 0) {
    const inputs = unclassified.map((m) => ({
      id: m.gmailMessageId,
      from: m.fromName ? `${m.fromName} <${m.fromEmail ?? ""}>` : m.fromEmail ?? "",
      subject: m.subject ?? "",
      snippet: m.snippet ?? "",
    }));

    try {
      const r = await classifyMails(inputs);
      // 배치는 BATCH_SIZE = 10. unclassified 20건이면 LLM 호출 2회.
      llmCalls = Math.ceil(unclassified.length / CLASSIFY_META.batchSize);
      totalCostUsd = r.costUsd;

      for (const c of r.classifications) {
        await db
          .update(gmailCache)
          .set({
            aiPriority: c.priority,
            needsReply: c.needsReply,
            aiSummary: c.summary,
          })
          .where(eq(gmailCache.gmailMessageId, c.id));
        classified += 1;
      }

      // agent_logs 기록 (정연 agent_id)
      if (jeongyeonAgentId) {
        try {
          await db.insert(agentLogs).values({
            agentId: jeongyeonAgentId,
            trigger: "gmail_classify",
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            durationMs: 0,
            costUsd: r.costUsd.toFixed(6),
            isError: false,
            errorMessage: null,
          });
        } catch (e) {
          console.error("[gmail/sync] agent_logs insert failed:", e);
        }
      }
    } catch (e) {
      errors.push(`classify failed: ${errMsg(e)}`);
    }
  }

  // ── 5. settings_json.lastGmailSync 기록 ────────────────
  const summary = {
    at: new Date().toISOString(),
    fetched: messageRefs.length,
    inserted,
    classified,
    costUsd: totalCostUsd,
  };
  try {
    await db
      .update(users)
      .set({
        settingsJson: sql`
          COALESCE(${users.settingsJson}, '{}'::jsonb)
          || jsonb_build_object('lastGmailSync', ${JSON.stringify(summary)}::jsonb)
        `,
      })
      .where(eq(users.id, params.userId));
  } catch (e) {
    errors.push(`settings update failed: ${errMsg(e)}`);
  }

  return {
    fetched: messageRefs.length,
    inserted,
    classified,
    llmCalls,
    totalCostUsd,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// satisfy unused-import
void tsTz;
void and;
