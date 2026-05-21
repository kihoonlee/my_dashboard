// 알림 단일 소스. 호출자는 채널 분기 신경 안 쓰고 dispatchNotification만 호출.
//
// 흐름:
//   1) notifications 테이블 insert (인앱 헤더 종 배지 + /notifications 페이지)
//   2) users.settings_json.telegram_chat_id 있으면 텔레그램 push (best-effort)
//   3) 어느 채널이 실패해도 throw 안 함 — agent_logs에 에러 메시지만 남기게
//      caller가 처리. (실패해도 inApp insert는 항상 성공해야 함.)

import "server-only";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/client";

export type NotificationKind =
  | "daily_report"
  | "agent_alert"
  | "discussion_result"
  | "calendar_reminder";

export type DispatchInput = {
  userId: string;
  kind: string;
  title: string;
  bodyMd: string;
  payload?: Record<string, unknown>;
};

export async function dispatchNotification(input: DispatchInput): Promise<string> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      bodyMd: input.bodyMd,
      payloadJson: input.payload ?? {},
    })
    .returning({ id: notifications.id });

  // Telegram (best-effort)
  try {
    const [userRow] = await db
      .select({ settingsJson: users.settingsJson })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    const settings =
      (userRow?.settingsJson as { telegram_chat_id?: string } | null) ?? null;
    const chatIdFromSettings = settings?.telegram_chat_id;

    const text = `*${input.title}*\n\n${input.bodyMd}`;
    await sendTelegramMessage({ chatId: chatIdFromSettings, text });
  } catch {
    // 무시 — 인앱 insert는 이미 성공했으므로
  }

  return row.id;
}
