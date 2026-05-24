// Telegram Bot client.
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env로 동작.
// 둘 중 하나라도 비어 있으면 no-op (false 반환). 에러는 throw 안 함 — 알림 채널은 best-effort.

import "server-only";

export type TelegramSendResult = {
  sent: boolean;
  reason?: string;
};

function readEnvTrim(name: string): string {
  const v = process.env[name];
  return v ? v.trim() : "";
}

export async function sendTelegramMessage(params: {
  chatId?: string;
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}): Promise<TelegramSendResult> {
  const token = readEnvTrim("TELEGRAM_BOT_TOKEN");
  const chatId = params.chatId ?? readEnvTrim("TELEGRAM_CHAT_ID");
  if (!token) return { sent: false, reason: "TELEGRAM_BOT_TOKEN not set" };
  if (!chatId) return { sent: false, reason: "chat_id not set" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: params.text,
        parse_mode: params.parseMode ?? "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        sent: false,
        reason: `telegram ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sent: false, reason: `fetch failed: ${msg}` };
  }
}
