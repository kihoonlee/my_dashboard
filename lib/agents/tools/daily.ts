// 데일리 에이전트(새벽) 전용 도구.
// 매일 오전 8시 cron으로 자동 실행되거나 사용자가 직접 대화할 때.

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import {
  calendarEventsCache,
  diaryEntries,
  memos,
  todos,
} from "@/lib/db/schema";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { tsTz } from "@/lib/db/sql-utils";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import {
  sendNotificationTool,
  runSendNotification,
} from "./main";

// KST 기준 어제 / 오늘 [start, end) Date 객체 반환.
function kstDayRange(offsetDays: number): { start: Date; end: Date } {
  // KST = UTC+9. JS Date는 UTC 기준이므로 +9시간 오프셋 가산.
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 오늘 00:00 KST = UTC kstNow의 자정 - 9시간
  const kstY = kstNow.getUTCFullYear();
  const kstM = kstNow.getUTCMonth();
  const kstD = kstNow.getUTCDate();
  const startKstMs = Date.UTC(kstY, kstM, kstD + offsetDays);
  const start = new Date(startKstMs - 9 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function isoDate(d: Date): string {
  // KST 기준 date string
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ---- list_yesterday_memos ----
export const listYesterdayMemosTool: AgentTool = {
  name: "list_yesterday_memos",
  description:
    "어제(KST 기준) 작성된 메모 목록과 본문. 데일리 리포트 작성 시 오늘 할일 추출용 입력.",
  input_schema: { type: "object", properties: {} },
};

export async function runListYesterdayMemos(userId: string) {
  const { start } = kstDayRange(-1);
  const dateStr = isoDate(start);
  const rows = await db
    .select({
      id: memos.id,
      title: memos.title,
      bodyMd: memos.bodyMd,
      createdAt: memos.createdAt,
    })
    .from(memos)
    .where(
      and(
        eq(memos.userId, userId),
        eq(memos.entryDate, dateStr),
        eq(memos.archived, false),
      ),
    )
    .orderBy(asc(memos.createdAt));
  return {
    ok: true as const,
    result: { date: dateStr, count: rows.length, items: rows },
  };
}

// ---- list_today_events ----
export const listTodayEventsTool: AgentTool = {
  name: "list_today_events",
  description:
    "오늘(KST 00:00 - 23:59) Google Calendar 이벤트 목록. 오늘 할일 추출 + 리포트에 일정 포함.",
  input_schema: { type: "object", properties: {} },
};

export async function runListTodayEvents() {
  const { start, end } = kstDayRange(0);
  const rows = await db
    .select({
      id: calendarEventsCache.id,
      title: calendarEventsCache.title,
      startAt: calendarEventsCache.startAt,
      endAt: calendarEventsCache.endAt,
      location: calendarEventsCache.location,
    })
    .from(calendarEventsCache)
    .where(
      and(
        gte(calendarEventsCache.startAt, start),
        lt(calendarEventsCache.startAt, end),
      ),
    )
    .orderBy(asc(calendarEventsCache.startAt));
  return {
    ok: true as const,
    result: {
      date: isoDate(start),
      count: rows.length,
      items: rows,
    },
  };
}

// ---- list_yesterday_actions ----
export const listYesterdayActionsTool: AgentTool = {
  name: "list_yesterday_actions",
  description:
    "어제(KST) 완료된 todo, 작성된 일기·메모, 어제 발생한 캘린더 이벤트를 모두 모은 활동 요약. 어제 회고 리포트에 사용.",
  input_schema: { type: "object", properties: {} },
};

export async function runListYesterdayActions(userId: string) {
  const { start, end } = kstDayRange(-1);
  const dateStr = isoDate(start);

  const completedTodos = await db
    .select({
      id: todos.id,
      title: todos.title,
      tag: todos.tag,
      completedAt: todos.completedAt,
    })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        sql`${todos.completedAt} >= ${tsTz(start)}`,
        sql`${todos.completedAt} < ${tsTz(end)}`,
      ),
    )
    .orderBy(asc(todos.completedAt));

  const writtenMemos = await db
    .select({
      id: memos.id,
      title: memos.title,
      bodyMd: memos.bodyMd,
    })
    .from(memos)
    .where(
      and(eq(memos.userId, userId), eq(memos.entryDate, dateStr)),
    );

  const writtenDiaries = await db
    .select({
      title: diaryEntries.title,
      bodyMd: diaryEntries.bodyMd,
      mood: diaryEntries.mood,
    })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        eq(diaryEntries.entryDate, dateStr),
      ),
    )
    .limit(1);

  const events = await db
    .select({
      title: calendarEventsCache.title,
      startAt: calendarEventsCache.startAt,
      endAt: calendarEventsCache.endAt,
    })
    .from(calendarEventsCache)
    .where(
      and(
        gte(calendarEventsCache.startAt, start),
        lt(calendarEventsCache.startAt, end),
      ),
    )
    .orderBy(asc(calendarEventsCache.startAt));

  return {
    ok: true as const,
    result: {
      date: dateStr,
      completedTodos: { count: completedTodos.length, items: completedTodos },
      memos: {
        count: writtenMemos.length,
        items: writtenMemos.map((m) => ({
          ...m,
          bodyMd: m.bodyMd.slice(0, 400),
        })),
      },
      diary: writtenDiaries[0]
        ? { ...writtenDiaries[0], bodyMd: writtenDiaries[0].bodyMd.slice(0, 600) }
        : null,
      calendarEvents: { count: events.length, items: events },
    },
  };
}

// ---- create_todo ----
export const createTodoTool: AgentTool = {
  name: "create_todo",
  description:
    "오늘 해야 할 todo 등록. 메모/캘린더에서 추출한 액션을 todo로 옮길 때 사용. dueDate 미지정 시 오늘 날짜.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      notes: { type: "string" },
      due_date: {
        type: "string",
        description: "YYYY-MM-DD. 생략하면 오늘.",
      },
      is_important: { type: "boolean" },
      tag: { type: "string", description: "프로젝트 분류 태그" },
    },
    required: ["title"],
  },
};

export async function runCreateTodo(
  userId: string,
  input: Record<string, unknown>,
) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { ok: false as const, error: "title is required" };
  const notes = typeof input.notes === "string" ? input.notes : null;
  const dueDate =
    typeof input.due_date === "string" && input.due_date
      ? input.due_date
      : isoDate(kstDayRange(0).start);
  const isImportant = input.is_important === true;
  const tag = typeof input.tag === "string" && input.tag ? input.tag : null;

  const [row] = await db
    .insert(todos)
    .values({
      userId,
      title,
      notes,
      dueDate,
      isImportant,
      tag,
    })
    .returning({ id: todos.id });

  return {
    ok: true as const,
    result: { id: row.id, title, dueDate, isImportant, tag },
  };
}

// ---- export bundle ----
export const dailyTools: AgentTool[] = [
  listYesterdayMemosTool,
  listTodayEventsTool,
  listYesterdayActionsTool,
  createTodoTool,
  sendNotificationTool,
];

export async function runDailyTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "list_yesterday_memos":
      return runListYesterdayMemos(userId);
    case "list_today_events":
      return runListTodayEvents();
    case "list_yesterday_actions":
      return runListYesterdayActions(userId);
    case "create_todo":
      return runCreateTodo(userId, input);
    case "send_notification":
      return runSendNotification(userId, input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}

// daily-8am cron이 사용하는 헬퍼 — 라우터에서 호출.
export async function dailyRunYesterdayActions(userId: string) {
  return runListYesterdayActions(userId);
}

export { dispatchNotification };
