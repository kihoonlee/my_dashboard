// Google Calendar API 헬퍼.
// Supabase는 access_token을 만료시키므로, 우리가 oauth_tokens에 보관한 refresh_token으로
// 매 호출마다 access_token을 새로 받아 쓴다. (5-10분 캐싱은 추후 정밀화 — 현재는 단순함 우선)

import "server-only";
import { loadRefreshToken } from "@/lib/oauth/token-store";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  status?: string;
};

type RefreshResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly needsReauth = false,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      "GOOGLE_OAUTH_CLIENT_ID/SECRET 환경변수가 누락되었습니다.",
    );
  }
  return { clientId, clientSecret };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshResponse> {
  const { clientId, clientSecret } = getClientCreds();
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // invalid_grant = 사용자가 권한 회수했거나 토큰 만료 → 재로그인 필요
    const needsReauth = text.includes("invalid_grant");
    throw new GoogleAuthError(
      `Google token refresh 실패 (${res.status}): ${text.slice(0, 200)}`,
      undefined,
      needsReauth,
    );
  }

  return (await res.json()) as RefreshResponse;
}

/**
 * 사용자의 access token을 발급한다.
 * oauth_tokens에 refresh_token이 없으면 GoogleAuthError(needsReauth=true) 던짐.
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const stored = await loadRefreshToken({ userId, provider: "google" });
  if (!stored) {
    throw new GoogleAuthError(
      "Google 권한이 등록되지 않았습니다. /auth/login에서 다시 로그인하세요.",
      undefined,
      true,
    );
  }
  const { access_token } = await refreshAccessToken(stored.refreshToken);
  return access_token;
}

export async function listCalendarEvents(params: {
  accessToken: string;
  calendarId?: string;
  timeMin: Date;
  timeMax: Date;
  maxResults?: number;
}): Promise<GoogleCalendarEvent[]> {
  const calendarId = params.calendarId ?? "primary";
  const url = new URL(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set("timeMin", params.timeMin.toISOString());
  url.searchParams.set("timeMax", params.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(params.maxResults ?? 50));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `Calendar events.list 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return json.items ?? [];
}

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
  hidden?: boolean;
  accessRole?: string;
};

/**
 * 사용자의 calendarList 항목(구독 캘린더 포함)을 반환한다.
 * 기본은 표시(selected) 켜진 + 삭제/숨김 안 된 캘린더만.
 * Google은 primary 캘린더에 selected 필드를 안 보낼 수 있어, 명시적 false만 제외.
 */
export async function listCalendars(params: {
  accessToken: string;
  includeHidden?: boolean;
}): Promise<GoogleCalendarListEntry[]> {
  const url = new URL(`${CALENDAR_BASE}/users/me/calendarList`);
  url.searchParams.set("minAccessRole", "reader");
  if (params.includeHidden) url.searchParams.set("showHidden", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `CalendarList.list 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { items?: GoogleCalendarListEntry[] };
  const items = json.items ?? [];
  return items.filter(
    (c) => c.deleted !== true && c.hidden !== true && c.selected !== false,
  );
}
