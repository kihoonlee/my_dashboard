// GET /api/search?q=...&type=diary|memo|todo|session|all&limit=20
//
// 일기·메모·Todo·채팅세션 통합 검색. 각 도메인 ilike(title) OR ilike(body/content).
// type=all (기본)이면 4개 도메인 병렬 + 합쳐서 limit per 도메인.
// 빈 q면 빈 결과.

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  chatMessages,
  chatSessions,
  diaryEntries,
  memos,
  todos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/api/auth";

type DiaryHit = {
  type: "diary";
  id: string;
  title: string | null;
  snippet: string;
  date: string;
  href: string;
};
type MemoHit = {
  type: "memo";
  id: string;
  title: string | null;
  snippet: string;
  date: string;
  href: string;
};
type TodoHit = {
  type: "todo";
  id: string;
  title: string;
  snippet: string | null;
  dueDate: string | null;
  isImportant: boolean;
  completedAt: string | null;
  href: string;
};
type SessionHit = {
  type: "session";
  id: string;
  title: string | null;
  agentEnglishName: string | null;
  lastMessageAt: string;
  href: string;
};

export type SearchHit = DiaryHit | MemoHit | TodoHit | SessionHit;

function snippet(body: string | null, q: string, len = 120): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return body.slice(0, len);
  const start = Math.max(0, idx - 30);
  const end = Math.min(body.length, idx + q.length + 80);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const url = request.nextUrl;
  const qRaw = url.searchParams.get("q") ?? "";
  const q = qRaw.trim();
  const type = url.searchParams.get("type") ?? "all";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

  if (q.length === 0) {
    return NextResponse.json({ hits: [], total: 0 });
  }
  const pattern = `%${q}%`;

  // 도메인별로 병렬 fetch
  const wants = (t: string) => type === "all" || type === t;

  const [diaryRows, memoRows, todoRows, sessionRows] = await Promise.all([
    wants("diary")
      ? db
          .select({
            id: diaryEntries.id,
            title: diaryEntries.title,
            bodyMd: diaryEntries.bodyMd,
            entryDate: diaryEntries.entryDate,
          })
          .from(diaryEntries)
          .where(
            and(
              eq(diaryEntries.userId, userId),
              or(
                ilike(diaryEntries.title, pattern),
                ilike(diaryEntries.bodyMd, pattern),
              ),
            ),
          )
          .orderBy(desc(diaryEntries.entryDate))
          .limit(limit)
      : Promise.resolve([]),
    wants("memo")
      ? db
          .select({
            id: memos.id,
            title: memos.title,
            bodyMd: memos.bodyMd,
            entryDate: memos.entryDate,
          })
          .from(memos)
          .where(
            and(
              eq(memos.userId, userId),
              eq(memos.archived, false),
              or(ilike(memos.title, pattern), ilike(memos.bodyMd, pattern)),
            ),
          )
          .orderBy(desc(memos.entryDate))
          .limit(limit)
      : Promise.resolve([]),
    wants("todo")
      ? db
          .select({
            id: todos.id,
            title: todos.title,
            notes: todos.notes,
            dueDate: todos.dueDate,
            isImportant: todos.isImportant,
            completedAt: todos.completedAt,
          })
          .from(todos)
          .where(
            and(
              eq(todos.userId, userId),
              eq(todos.archived, false),
              or(ilike(todos.title, pattern), ilike(todos.notes, pattern)),
            ),
          )
          .orderBy(desc(todos.createdAt))
          .limit(limit)
      : Promise.resolve([]),
    wants("session")
      ? db
          .select({
            id: chatSessions.id,
            title: chatSessions.title,
            agentEnglishName: sql<string | null>`(
              SELECT english_name FROM agents WHERE id = ${chatSessions.agentId}
            )`,
            lastMessageAt: chatSessions.lastMessageAt,
          })
          .from(chatSessions)
          .where(
            and(
              eq(chatSessions.userId, userId),
              eq(chatSessions.hidden, false),
              or(
                ilike(chatSessions.title, pattern),
                sql`EXISTS (
                  SELECT 1 FROM ${chatMessages} m
                  WHERE m.session_id = ${chatSessions.id}
                    AND m.content ILIKE ${pattern}
                )`,
              ),
            ),
          )
          .orderBy(desc(chatSessions.lastMessageAt))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const hits: SearchHit[] = [
    ...diaryRows.map(
      (r): DiaryHit => ({
        type: "diary",
        id: r.id,
        title: r.title,
        snippet: snippet(r.bodyMd, q),
        date: r.entryDate,
        href: `/diary?date=${r.entryDate}`,
      }),
    ),
    ...memoRows.map(
      (r): MemoHit => ({
        type: "memo",
        id: r.id,
        title: r.title,
        snippet: snippet(r.bodyMd, q),
        date: r.entryDate,
        href: `/memos/${r.id}`,
      }),
    ),
    ...todoRows.map(
      (r): TodoHit => ({
        type: "todo",
        id: r.id,
        title: r.title,
        snippet: r.notes ? snippet(r.notes, q) : null,
        dueDate: r.dueDate,
        isImportant: r.isImportant,
        completedAt: r.completedAt
          ? r.completedAt.toISOString()
          : null,
        href: `/todos`,
      }),
    ),
    ...sessionRows.map(
      (r): SessionHit => ({
        type: "session",
        id: r.id,
        title: r.title,
        agentEnglishName: r.agentEnglishName,
        lastMessageAt: r.lastMessageAt.toISOString(),
        href: `/chat?agent=${r.agentEnglishName ?? "main"}&session=${r.id}`,
      }),
    ),
  ];

  return NextResponse.json({
    hits,
    total: hits.length,
    breakdown: {
      diary: diaryRows.length,
      memo: memoRows.length,
      todo: todoRows.length,
      session: sessionRows.length,
    },
  });
}
