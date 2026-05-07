"use client";

// /knowledge — 옵시디언 vault 의미 검색 UI.
// 상단: 검색 박스 + 동기화 버튼 + 마지막 sync 메타.
// 좌측(또는 위): 검색 결과 리스트 (점수 + preview).
// 우측(또는 선택 시): 클릭한 노트의 본문 (raw markdown).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  filePath: string;
  title: string;
  preview: string;
  tags: string[];
  score: number;
};

type NoteDetail = {
  id: string;
  filePath: string;
  title: string;
  content: string;
  tags: string[];
  wordCount: number;
  lastModified: string | null;
  syncedAt: string;
};

export default function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<NoteDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(
        `/api/knowledge/search?q=${encodeURIComponent(q)}&limit=20`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      setResults(data.results);
    } catch (e) {
      setError(`검색 실패: ${e instanceof Error ? e.message : String(e)}`);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function loadNote(path: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge/note?path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);
      setSelected(data.note);
    } catch (e) {
      setError(`노트 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function syncVault() {
    if (syncing) return;
    setSyncing(true);
    setSyncSummary(null);
    setSyncErrors([]);
    setError(null);
    try {
      const res = await fetch("/api/sync/obsidian", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      setSyncSummary(
        `동기화 완료 — 스캔 ${data.scanned}건 · 신규/갱신 ${data.upserted}건 · 변경없음 ${data.unchanged}건 · 삭제 ${data.deleted}건` +
          (data.errors?.length ? ` · 에러 ${data.errors.length}건` : ""),
      );
      setSyncErrors(Array.isArray(data.errors) ? data.errors : []);
      // sync 후 결과가 있으면 자동 검색 재실행
      if (query.trim()) await search();
    } catch (e) {
      setError(`동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  // 디바운스된 자동 검색 (입력 멈추면 600ms 후 search)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      void search();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">지식 · 옵시디언</h1>
          <p className="text-sm text-muted-foreground">
            로컬 옵시디언 vault에서 의미 기반 검색.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={syncVault}
          disabled={syncing}
          className="gap-2"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          vault 동기화
        </Button>
      </header>

      {syncSummary && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          {syncSummary}
        </div>
      )}
      {syncErrors.length > 0 && (
        <div className="border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-xs flex flex-col gap-1">
          <div className="font-medium">동기화 중 발생한 에러</div>
          <ul className="list-disc list-inside font-mono space-y-0.5">
            {syncErrors.slice(0, 10).map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
            {syncErrors.length > 10 && (
              <li className="opacity-60">
                ...외 {syncErrors.length - 10}건
              </li>
            )}
          </ul>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="자연어로 검색하세요 — 예: '스타트업 운영 원칙', '회의록 정리법'"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* 검색 결과 */}
        <section className="flex flex-col gap-3 min-h-[300px]">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>검색 결과</span>
            {results && <span>{results.length}건</span>}
          </div>
          {results === null ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              검색어를 입력하세요. 입력을 멈추면 자동으로 검색합니다.
            </div>
          ) : results.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              {searching ? "검색 중..." : "결과가 없습니다."}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => loadNote(r.filePath)}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-colors",
                      selected?.filePath === r.filePath
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm truncate flex-1">
                        {r.title}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {r.score.toFixed(3)}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 font-mono mt-0.5 truncate">
                      {r.filePath}
                    </div>
                    {r.preview && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {r.preview}
                      </p>
                    )}
                    {r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {r.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 노트 본문 */}
        <section className="flex flex-col gap-3 min-h-[300px]">
          <div className="text-xs text-muted-foreground">노트 본문</div>
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              로딩 중...
            </div>
          ) : !selected ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              왼쪽에서 노트를 선택하세요.
            </div>
          ) : (
            <article className="border border-border rounded-xl bg-card p-5">
              <header className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {selected.wordCount} 어절
                </span>
              </header>
              <div className="text-[11px] font-mono text-muted-foreground/80 mb-3">
                {selected.filePath}
                {selected.lastModified && (
                  <span> · 수정 {new Date(selected.lastModified).toLocaleString("ko-KR")}</span>
                )}
              </div>
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed text-foreground/90">
                {selected.content}
              </pre>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
