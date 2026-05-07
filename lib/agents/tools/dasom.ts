// 다솜(capture_assistant) 전용 tool.
// quick_captures + read_later + learnings 3개 테이블을 다룬다.
//
// 도구:
//   캡처:
//     - create_capture(content, type?, url?)
//     - list_captures(processed?, limit?)
//     - categorize_capture(captureId): LLM 분류 + ai_category 저장
//     - move_capture(captureId, target: "todo"|"read_later"|"learning"): 다른 테이블로 이동 + processed=true
//   읽을거리:
//     - add_read_later(url, title?, priority?, tags?)
//     - list_read_later(status?, limit?)
//     - mark_read(itemId)
//   학습:
//     - add_learning(content, tags?, source?)
//     - list_learnings(limit?)

import { db } from "@/lib/db/client";
import {
  agentLogs,
  agents,
  learnings,
  quickCaptures,
  readLater,
  todos,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";
import { categorizeCapture } from "@/lib/captures/categorize";

export const DASOM_TOOLS: AgentTool[] = [
  {
    name: "create_capture",
    description:
      "사용자 입력을 quick_captures에 저장 (분류 전). 사용자가 '이거 적어줘' / '이거 기억해줘' / 메모처럼 말할 때.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        type: {
          type: "string",
          enum: ["text", "url", "image"],
          description: "기본 text",
        },
        url: { type: "string", description: "URL이면 type=url + url 같이 넘김" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_captures",
    description: "최근 캡처 목록. processed=false면 미분류만.",
    input_schema: {
      type: "object",
      properties: {
        processed: { type: "boolean" },
        limit: { type: "number", description: "기본 20, 최대 100" },
      },
    },
  },
  {
    name: "categorize_capture",
    description:
      "캡처 1건을 LLM(Haiku)으로 분류 (todo/idea/learning/read_later). 비용 ~$0.0005. ai_category 컬럼 갱신.",
    input_schema: {
      type: "object",
      properties: {
        captureId: { type: "string" },
      },
      required: ["captureId"],
    },
  },
  {
    name: "move_capture",
    description:
      "캡처를 todos/read_later/learnings 중 하나로 이동. 원본 quick_captures는 processed=true로 마킹 (삭제 X — 추적용).",
    input_schema: {
      type: "object",
      properties: {
        captureId: { type: "string" },
        target: {
          type: "string",
          enum: ["todo", "read_later", "learning"],
        },
      },
      required: ["captureId", "target"],
    },
  },
  {
    name: "add_read_later",
    description: "URL을 읽을거리 큐에 추가.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "기본 medium",
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["url"],
    },
  },
  {
    name: "list_read_later",
    description: "읽을거리 큐 목록 (기본 unread만).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["unread", "read", "archived"],
          description: "기본 unread",
        },
        limit: { type: "number", description: "기본 20, 최대 100" },
      },
    },
  },
  {
    name: "mark_read",
    description: "읽을거리를 읽음 처리 (status=read, readAt=now).",
    input_schema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
  },
  {
    name: "add_learning",
    description:
      "배운 점 / 깨달음을 learnings에 저장. 사용자가 '이거 배웠어' / '인사이트' 류 말할 때.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        source: { type: "string", description: "출처 (책 제목 / URL / 사람 이름 등)" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_learnings",
    description: "최근 학습 목록.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "기본 20, 최대 100" },
      },
    },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function runDasomTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "create_capture": {
        const content = asString(input.content);
        if (!content) return { ok: false, error: "content is required" };
        const type = asString(input.type) ?? "text";
        const url = asString(input.url) ?? null;
        const [row] = await db
          .insert(quickCaptures)
          .values({ content, type, url })
          .returning();
        return { ok: true, result: row };
      }
      case "list_captures": {
        const limit = clamp(asNumber(input.limit) ?? 20, 1, 100);
        const conditions = [];
        if (typeof input.processed === "boolean") {
          conditions.push(eq(quickCaptures.processed, input.processed));
        }
        const rows = await db
          .select()
          .from(quickCaptures)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(quickCaptures.createdAt))
          .limit(limit);
        return { ok: true, result: { count: rows.length, captures: rows } };
      }
      case "categorize_capture": {
        const captureId = asString(input.captureId);
        if (!captureId) return { ok: false, error: "captureId is required" };
        const [cap] = await db
          .select()
          .from(quickCaptures)
          .where(eq(quickCaptures.id, captureId))
          .limit(1);
        if (!cap) return { ok: false, error: `capture ${captureId} not found` };

        const r = await categorizeCapture({
          content: cap.content,
          url: cap.url,
        });
        await db
          .update(quickCaptures)
          .set({ aiCategory: r.category })
          .where(eq(quickCaptures.id, captureId));

        // agent_logs 기록
        try {
          const [a] = await db
            .select({ id: agents.id })
            .from(agents)
            .where(eq(agents.englishName, "dasom"))
            .limit(1);
          if (a?.id) {
            await db.insert(agentLogs).values({
              agentId: a.id,
              trigger: "capture_categorize",
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              durationMs: 0,
              costUsd: r.costUsd.toFixed(6),
              isError: false,
              errorMessage: null,
            });
          }
        } catch (e) {
          console.error("[dasom] agent_logs insert failed:", e);
        }

        return {
          ok: true,
          result: {
            captureId,
            category: r.category,
            summary: r.summary,
            confidence: r.confidence,
            costUsd: r.costUsd,
          },
        };
      }
      case "move_capture": {
        const captureId = asString(input.captureId);
        const target = asString(input.target);
        if (!captureId || !target) {
          return { ok: false, error: "captureId and target are required" };
        }
        const [cap] = await db
          .select()
          .from(quickCaptures)
          .where(eq(quickCaptures.id, captureId))
          .limit(1);
        if (!cap) return { ok: false, error: `capture ${captureId} not found` };

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
            return { ok: false, error: "URL이 없는 캡처는 read_later로 옮길 수 없습니다" };
          }
          const [r] = await db
            .insert(readLater)
            .values({
              url: cap.url,
              title: cap.content.slice(0, 200),
              domain: extractDomain(cap.url),
              status: "unread",
              priority: "medium",
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
          return { ok: false, error: `unknown target: ${target}` };
        }

        await db
          .update(quickCaptures)
          .set({ processed: true, movedToTable, movedToId })
          .where(eq(quickCaptures.id, captureId));

        return {
          ok: true,
          result: { captureId, movedToTable, movedToId },
        };
      }
      case "add_read_later": {
        const url = asString(input.url);
        if (!url) return { ok: false, error: "url is required" };
        const [row] = await db
          .insert(readLater)
          .values({
            url,
            title: asString(input.title) ?? null,
            domain: extractDomain(url),
            status: "unread",
            priority: asString(input.priority) ?? "medium",
            tags: asStringArray(input.tags),
          })
          .returning();
        return { ok: true, result: row };
      }
      case "list_read_later": {
        const limit = clamp(asNumber(input.limit) ?? 20, 1, 100);
        const status = asString(input.status) ?? "unread";
        const rows = await db
          .select()
          .from(readLater)
          .where(eq(readLater.status, status))
          .orderBy(desc(readLater.savedAt))
          .limit(limit);
        return { ok: true, result: { count: rows.length, items: rows } };
      }
      case "mark_read": {
        const itemId = asString(input.itemId);
        if (!itemId) return { ok: false, error: "itemId is required" };
        const [row] = await db
          .update(readLater)
          .set({ status: "read", readAt: new Date() })
          .where(eq(readLater.id, itemId))
          .returning();
        if (!row) return { ok: false, error: `item ${itemId} not found` };
        return { ok: true, result: row };
      }
      case "add_learning": {
        const content = asString(input.content);
        if (!content) return { ok: false, error: "content is required" };
        const [row] = await db
          .insert(learnings)
          .values({
            content,
            tags: asStringArray(input.tags),
            source: asString(input.source) ?? null,
          })
          .returning();
        return { ok: true, result: row };
      }
      case "list_learnings": {
        const limit = clamp(asNumber(input.limit) ?? 20, 1, 100);
        const rows = await db
          .select()
          .from(learnings)
          .orderBy(desc(learnings.createdAt))
          .limit(limit);
        return { ok: true, result: { count: rows.length, learnings: rows } };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `dasom tool error: ${message}` };
  }
}
