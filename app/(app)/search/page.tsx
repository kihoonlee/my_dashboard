"use client";

// /search?q=...&type=all|diary|memo|todo|session
// 일기·메모·Todo·채팅세션 통합 검색.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CheckSquare,
  Loader2,
  MessageCircle,
  Search,
  StickyNote,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Hit =
  | {
      type: "diary";
      id: string;
      title: string | null;
      snippet: string;
      date: string;
      href: string;
    }
  | {
      type: "memo";
      id: string;
      title: string | null;
      snippet: string;
      date: string;
      href: string;
    }
  | {
      type: "todo";
      id: string;
      title: string;
      snippet: string | null;
      dueDate: string | null;
      isImportant: boolean;
      completedAt: string | null;
      href: string;
    }
  | {
      type: "session";
      id: string;
      title: string | null;
      agentEnglishName: string | null;
      lastMessageAt: string;
      href: string;
    };

type FilterType = "all" | "diary" | "memo" | "todo" | "session";

const FILTER_TABS: Array<{ key: FilterType; label: string }> = [
  { key: "all", label: "전체" },
  { key: "diary", label: "일기" },
  { key: "memo", label: "메모" },
  { key: "todo", label: "할일" },
  { key: "session", label: "대화" },
];

const TYPE_ICON: Record<Hit["type"], React.ComponentType<{ className?: string }>> =
  {
    diary: BookOpen,
    memo: StickyNote,
    todo: CheckSquare,
    session: MessageCircle,
  };

const TYPE_LABEL: Record<Hit["type"], string> = {
  diary: "일기",
  memo: "메모",
  todo: "할일",
  session: "대화",
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const typeParam = (searchParams.get("type") ?? "all") as FilterType;

  const [q, setQ] = useState<string>(qParam);
  const [debouncedQ, setDebouncedQ] = useState<string>(qParam);
  const [filter, setFilter] = useState<FilterType>(typeParam);
  const [hits, setHits] = useState<Hit[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // q debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // URL 동기화 (debouncedQ 또는 filter 변경 시)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (filter !== "all") params.set("type", filter);
    const next = params.toString() ? `/search?${params.toString()}` : "/search";
    window.history.replaceState(null, "", next);
  }, [debouncedQ, filter]);

  const fetchSearch = useCallback(async () => {
    if (!debouncedQ) {
      setHits([]);
      setBreakdown(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/search", window.location.origin);
      url.searchParams.set("q", debouncedQ);
      url.searchParams.set("type", filter);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        hits: Hit[];
        breakdown: Record<string, number>;
      };
      setHits(data.hits);
      setBreakdown(data.breakdown);
    } catch (e) {
      setError(`검색 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filter]);

  useEffect(() => {
    void fetchSearch();
  }, [fetchSearch]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight">검색</h1>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 h-11 text-sm focus-within:border-foreground/40 transition">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="일기 · 메모 · 할일 · 대화에서 검색"
            className="flex-1 bg-transparent text-foreground focus:outline-none placeholder:text-muted-foreground/60"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="검색어 지우기"
              className="text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {FILTER_TABS.map(({ key, label }) => {
            const count = key === "all" ? hits.length : breakdown?.[key] ?? 0;
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 transition",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
                {debouncedQ && (
                  <span className="ml-1.5 font-mono opacity-70">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3 text-sm"
        >
          {error}
        </div>
      )}

      {!debouncedQ ? (
        <div className="border border-dashed border-border rounded-3xl p-10 text-center text-sm text-muted-foreground">
          검색어를 입력하세요. 제목과 본문 모두에서 찾습니다.
        </div>
      ) : hits.length === 0 ? (
        <div className="border border-dashed border-border rounded-3xl p-10 text-center text-sm text-muted-foreground">
          {`'${debouncedQ}' 검색 결과가 없어요.`}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {hits.map((h) => (
            <HitRow
              key={`${h.type}-${h.id}`}
              hit={h}
              query={debouncedQ}
              onClick={() => router.push(h.href)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function HitRow({
  hit,
  query,
  onClick,
}: {
  hit: Hit;
  query: string;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[hit.type];
  const label = TYPE_LABEL[hit.type];

  // 메타 — 도메인별 두 번째 줄
  const meta = (() => {
    if (hit.type === "diary" || hit.type === "memo") return hit.date;
    if (hit.type === "todo") {
      const parts: string[] = [];
      if (hit.dueDate) parts.push(`마감 ${hit.dueDate}`);
      if (hit.completedAt) parts.push("완료");
      else if (hit.isImportant) parts.push("중요");
      return parts.join(" · ") || "미완료";
    }
    return new Date(hit.lastMessageAt).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

  return (
    <li>
      <Link
        href={hit.href}
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        className="group block rounded-2xl border border-border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-xl bg-muted text-muted-foreground shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {meta}
              </span>
            </div>
            <div className="text-sm font-medium truncate">
              <Highlight text={titleOf(hit)} query={query} />
            </div>
            {hasSnippet(hit) && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                <Highlight text={snippetOf(hit)} query={query} />
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function titleOf(h: Hit): string {
  if (h.type === "todo") return h.title;
  return h.title?.trim() || "(제목 없음)";
}
function hasSnippet(h: Hit): boolean {
  if (h.type === "todo") return !!h.snippet;
  return h.type !== "session";
}
function snippetOf(h: Hit): string {
  if (h.type === "todo") return h.snippet ?? "";
  if (h.type === "session") return "";
  return h.snippet;
}

/** 검색어 하이라이트 (대소문자 무시). */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(qLower);
  while (idx >= 0) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark
        key={`m-${idx}`}
        className="bg-[var(--pastel-cream)] text-foreground rounded-sm px-0.5"
      >
        {text.slice(idx, idx + qLower.length)}
      </mark>,
    );
    cursor = idx + qLower.length;
    idx = lower.indexOf(qLower, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> 로딩 중…
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
