// Google Gmail API 헬퍼.
// Calendar와 동일한 패턴: oauth_tokens의 refresh_token으로 access_token 발급 후 fetch.
//
// 사용 scope: https://www.googleapis.com/auth/gmail.readonly
//
// 흐름:
// 1. listMessages — 최근 메시지 ID 목록 (q="" newer_than:7d 같은 필터 가능)
// 2. getMessage — 개별 메시지 메타 + 본문 일부 (snippet) — format=metadata로 헤더만 가져와 비용 최소화

import "server-only";
import { GoogleAuthError } from "@/lib/google/calendar";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessageMeta = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

export type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

/**
 * 받은편지함의 최근 메시지 ID 목록.
 * q는 Gmail 검색 문법 — `in:inbox newer_than:7d -category:promotions` 등.
 */
export async function listMessages(params: {
  accessToken: string;
  q?: string;
  maxResults?: number;
  labelIds?: string[];
}): Promise<GmailListResponse> {
  const url = new URL(`${GMAIL_BASE}/messages`);
  url.searchParams.set("maxResults", String(params.maxResults ?? 50));
  if (params.q) url.searchParams.set("q", params.q);
  for (const lid of params.labelIds ?? []) {
    url.searchParams.append("labelIds", lid);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `Gmail messages.list 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as GmailListResponse;
}

/**
 * 단일 메시지 메타 + snippet. format=metadata로 헤더(From/Subject/Date)와 snippet만.
 * 본문 전체가 필요하면 format=full로 따로 호출.
 */
export async function getMessageMeta(params: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessageMeta> {
  const url = new URL(`${GMAIL_BASE}/messages/${params.messageId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `Gmail messages.get 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as GmailMessageMeta;
}

/**
 * 한 스레드의 모든 메시지 (가장 최근 N개) — 정연의 summarize_thread tool용.
 */
export async function getThread(params: {
  accessToken: string;
  threadId: string;
}): Promise<{ id: string; messages: GmailMessageMeta[] }> {
  const url = new URL(`${GMAIL_BASE}/threads/${params.threadId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `Gmail threads.get 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as { id: string; messages: GmailMessageMeta[] };
}

/**
 * 헤더 헬퍼 — case-insensitive lookup.
 */
export function header(
  msg: GmailMessageMeta,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === lower)
    ?.value;
}

/**
 * "Name <email@x.com>" 또는 "email@x.com" 형식의 From 헤더를 분리.
 */
export function parseFrom(value: string | undefined): {
  name: string | null;
  email: string | null;
} {
  if (!value) return { name: null, email: null };
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    return { name: m[1].trim() || null, email: m[2].trim() };
  }
  // pure email
  if (value.includes("@")) return { name: null, email: value.trim() };
  return { name: value.trim(), email: null };
}
