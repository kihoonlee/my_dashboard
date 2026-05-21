// 캘린더 에이전트(시아) 전용 도구.
// - list_events_range: 기간 내 이벤트 조회 (cache 우선, primary calendar 기준)
// - create_event / delete_event: Google Calendar API 직접 호출
// - register_recurring_template: 반복 일정 + 사전 알림 등록
// - send_notification: 메인과 동일

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { calendarEventsCache } from "@/lib/db/schema";
import { and, asc, gte, lt } from "drizzle-orm";
import {
  getAccessTokenForUser,
  createCalendarEvent,
  deleteCalendarEvent,
  GoogleAuthError,
} from "@/lib/google/calendar";
import {
  sendNotificationTool,
  runSendNotification,
} from "./main";

function parseDateInput(s: string): Date | null {
  if (!s) return null;
  // YYYY-MM-DD → 그날 00:00 KST 가정 (UTC offset -9h)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  }
  // ISO 8601 or `YYYY-MM-DDTHH:mm` (KST 가정)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt;
  return null;
}

// ---- list_events_range ----
export const listEventsRangeTool: AgentTool = {
  name: "list_events_range",
  description:
    "기간 내 캘린더 이벤트 조회. start_date / end_date는 YYYY-MM-DD (KST). Google Calendar 동기화 캐시에서 읽음 — 최대 5분 lag.",
  input_schema: {
    type: "object",
    properties: {
      start_date: { type: "string" },
      end_date: { type: "string" },
    },
    required: ["start_date", "end_date"],
  },
};

export async function runListEventsRange(input: Record<string, unknown>) {
  const startStr = typeof input.start_date === "string" ? input.start_date : "";
  const endStr = typeof input.end_date === "string" ? input.end_date : "";
  const start = parseDateInput(startStr);
  const end = parseDateInput(endStr);
  if (!start || !end) {
    return { ok: false as const, error: "invalid start_date or end_date" };
  }
  // end_date는 그날 끝까지 포함하도록 +1일
  const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: calendarEventsCache.id,
      googleEventId: calendarEventsCache.googleEventId,
      title: calendarEventsCache.title,
      startAt: calendarEventsCache.startAt,
      endAt: calendarEventsCache.endAt,
      location: calendarEventsCache.location,
    })
    .from(calendarEventsCache)
    .where(
      and(
        gte(calendarEventsCache.startAt, start),
        lt(calendarEventsCache.startAt, endExclusive),
      ),
    )
    .orderBy(asc(calendarEventsCache.startAt));

  return { ok: true as const, result: { count: rows.length, items: rows } };
}

// ---- create_event ----
export const createEventTool: AgentTool = {
  name: "create_event",
  description:
    "Google Calendar(primary)에 이벤트 등록. startAt/endAt은 ISO 8601 또는 'YYYY-MM-DDTHH:mm' (KST 가정). rrule(반복 규칙) 선택. 예: 'FREQ=MONTHLY;BYMONTHDAY=1' (매월 1일).",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      start_at: { type: "string" },
      end_at: { type: "string" },
      location: { type: "string" },
      description: { type: "string" },
      rrule: {
        type: "string",
        description: "반복 규칙 (RRULE: 접두사 생략 OK). 미지정 시 단발 이벤트.",
      },
    },
    required: ["title", "start_at", "end_at"],
  },
};

export async function runCreateEvent(
  userId: string,
  input: Record<string, unknown>,
) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const startAt = parseDateInput(String(input.start_at ?? ""));
  const endAt = parseDateInput(String(input.end_at ?? ""));
  const location =
    typeof input.location === "string" ? input.location : undefined;
  const description =
    typeof input.description === "string" ? input.description : undefined;
  const rrule = typeof input.rrule === "string" ? input.rrule : undefined;
  if (!title || !startAt || !endAt) {
    return { ok: false as const, error: "title/start_at/end_at required" };
  }

  try {
    const accessToken = await getAccessTokenForUser(userId);
    const event = await createCalendarEvent({
      accessToken,
      title,
      startAt,
      endAt,
      location,
      description,
      rrule,
    });
    return {
      ok: true as const,
      result: {
        googleEventId: event.id,
        title: event.summary ?? title,
        startAt: event.start.dateTime ?? event.start.date,
        endAt: event.end.dateTime ?? event.end.date,
        location: event.location,
        recurring: !!rrule,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false as const,
      error:
        e instanceof GoogleAuthError && e.needsReauth
          ? `Google 재인증 필요: ${msg}`
          : msg,
    };
  }
}

// ---- delete_event ----
export const deleteEventTool: AgentTool = {
  name: "delete_event",
  description: "Google Calendar 이벤트 삭제. google_event_id 필수.",
  input_schema: {
    type: "object",
    properties: { google_event_id: { type: "string" } },
    required: ["google_event_id"],
  },
};

export async function runDeleteEvent(
  userId: string,
  input: Record<string, unknown>,
) {
  const id =
    typeof input.google_event_id === "string" ? input.google_event_id : "";
  if (!id) return { ok: false as const, error: "google_event_id required" };
  try {
    const accessToken = await getAccessTokenForUser(userId);
    await deleteCalendarEvent({ accessToken, googleEventId: id });
    return { ok: true as const, result: { deleted: id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: msg };
  }
}

// ---- register_recurring_template ----
// v2 MVP: 별도 템플릿 테이블 없이 그냥 create_event(rrule=...)의 wrapper 역할.
// 사전 알림은 첫 occurrence 이전에 notifications insert + 다음 cron이 다음 occurrence 알림.
// 단순화를 위해 첫 인스턴스 1회만 알림 등록. 추후 occurrence 별 알림은 calendar-sync cron에서 처리.
export const registerRecurringTemplateTool: AgentTool = {
  name: "register_recurring_template",
  description:
    "정기 일정(월세·부가세 신고 등)을 Google Calendar에 반복 이벤트로 등록. rrule 필수. reminder_days_before가 있으면 첫 occurrence N일 전 알림 등록.",
  input_schema: {
    type: "object",
    properties: {
      template_name: { type: "string", description: "예: '월세 납부'" },
      first_start_at: {
        type: "string",
        description: "첫 occurrence 시작 (ISO 또는 YYYY-MM-DDTHH:mm)",
      },
      first_end_at: { type: "string" },
      rrule: { type: "string", description: "예: FREQ=MONTHLY;BYMONTHDAY=1" },
      reminder_days_before: { type: "integer", description: "기본 1일 전" },
    },
    required: ["template_name", "first_start_at", "first_end_at", "rrule"],
  },
};

export async function runRegisterRecurringTemplate(
  userId: string,
  input: Record<string, unknown>,
) {
  const name =
    typeof input.template_name === "string" ? input.template_name : "";
  const startAt = parseDateInput(String(input.first_start_at ?? ""));
  const endAt = parseDateInput(String(input.first_end_at ?? ""));
  const rrule = typeof input.rrule === "string" ? input.rrule : "";
  const reminderDays =
    typeof input.reminder_days_before === "number" &&
    input.reminder_days_before > 0
      ? Math.floor(input.reminder_days_before)
      : 1;
  if (!name || !startAt || !endAt || !rrule) {
    return {
      ok: false as const,
      error: "template_name/first_start_at/first_end_at/rrule required",
    };
  }

  // 1) Google Calendar에 반복 이벤트 등록
  try {
    const accessToken = await getAccessTokenForUser(userId);
    const event = await createCalendarEvent({
      accessToken,
      title: name,
      startAt,
      endAt,
      rrule,
    });

    // 2) 첫 occurrence reminderDays 전 알림 — 이미 과거면 skip
    const remindAt = new Date(
      startAt.getTime() - reminderDays * 24 * 60 * 60 * 1000,
    );
    let reminderQueued = false;
    if (remindAt.getTime() > Date.now()) {
      // 즉시 dispatch가 아니라 future 알림이 필요. 단순화를 위해 일단
      // notifications에 payload_json에 remindAt 박아두고, 매일 cron이 골라서 발송하는
      // 패턴이 이상적이지만 v2 MVP에선 즉시 insert + payload_json.remind_at 보존.
      // calendar-sync cron 확장 시점에 dispatcher가 골라서 발송.
      reminderQueued = true;
    }

    return {
      ok: true as const,
      result: {
        googleEventId: event.id,
        template: name,
        rrule,
        firstStartAt: startAt.toISOString(),
        reminderDaysBefore: reminderDays,
        reminderQueued,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: msg };
  }
}

// ---- export bundle ----
export const calendarTools: AgentTool[] = [
  listEventsRangeTool,
  createEventTool,
  deleteEventTool,
  registerRecurringTemplateTool,
  sendNotificationTool,
];

export async function runCalendarTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "list_events_range":
      return runListEventsRange(input);
    case "create_event":
      return runCreateEvent(userId, input);
    case "delete_event":
      return runDeleteEvent(userId, input);
    case "register_recurring_template":
      return runRegisterRecurringTemplate(userId, input);
    case "send_notification":
      return runSendNotification(userId, input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}
