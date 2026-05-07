"use client";

// /business — GitHub 다이제스트 보고 화면.
// 헤드라인(전체 종합) + 활성 프로덕트 카드 그리드(요약) + 오래된 프로젝트 접힌 섹션.
// 동기화 버튼 → /api/sync/github (LLM 호출, 비용은 사후 표시).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Headline = {
  summary: string;
  activityCount: number;
  periodStart: string;
  periodEnd: string;
  costUsd: number;
  createdAt: string;
};

type ProductDigest = {
  slug: string;
  name: string;
  status: string;
  githubRepo: string | null;
  language: string | null;
  lastCommitAt: string | null;
  summary: string;
  activityCount: number;
  costUsd: number;
  periodStart: string;
  periodEnd: string;
};

type StaleProduct = {
  slug: string;
  name: string;
  status: string;
  lastCommitAt: string | null;
};

type DigestsResponse = {
  headline: Headline | null;
  products: ProductDigest[];
  stale: StaleProduct[];
};

type SyncResponse = {
  org: string;
  repos: number;
  activeRepos: number;
  staleRepos: number;
  archivedRepos: number;
  newActivities: number;
  llmCalls: number;
  totalCostUsd: number;
  digests: Array<{ slug: string; activityCount: number; costUsd: number }>;
  headline: string | null;
  errors: string[];
  durationMs: number;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) {
    const hours = Math.floor(ms / 3_600_000);
    return hours < 1 ? "방금" : `${hours}시간 전`;
  }
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

export default function BusinessPage() {
  const [data, setData] = useState<DigestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleOpen, setStaleOpen] = useState(false);

  async function fetchDigests() {
    setLoading(true);
    try {
      const res = await fetch("/api/business/digests", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as DigestsResponse;
      setData(json);
    } catch (e) {
      setError(`다이제스트 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function syncGithub() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/github", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? json?.error ?? `status ${res.status}`);
      }
      setSyncResult(json as SyncResponse);
      await fetchDigests();
    } catch (e) {
      setError(`동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void fetchDigests();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">사업 · 프로덕트</h1>
          <p className="text-sm text-muted-foreground">
            FlowTo-ai 조직의 최근 14일 활동을 요약 보고로 받아봅니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={syncGithub}
          disabled={syncing}
          className="gap-2"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          GitHub 동기화
        </Button>
      </header>

      {syncResult && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <strong>{syncResult.repos}</strong>개 repo (active{" "}
            <strong>{syncResult.activeRepos}</strong>, stale{" "}
            {syncResult.staleRepos}, archived {syncResult.archivedRepos})
          </span>
          <span>
            신규 활동 <strong>{syncResult.newActivities}</strong>건
          </span>
          <span>
            LLM 호출 <strong>{syncResult.llmCalls}</strong>회 ·{" "}
            <strong>${syncResult.totalCostUsd.toFixed(4)}</strong>
          </span>
          <span className="text-muted-foreground">
            ({(syncResult.durationMs / 1000).toFixed(1)}s)
          </span>
          {syncResult.errors.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              에러 {syncResult.errors.length}건
            </span>
          )}
        </div>
      )}

      {syncResult && syncResult.errors.length > 0 && (
        <div className="border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-xs">
          <ul className="list-disc list-inside font-mono space-y-0.5 max-h-40 overflow-y-auto">
            {syncResult.errors.slice(0, 10).map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
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

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          로딩 중...
        </div>
      ) : !data || (!data.headline && data.products.length === 0) ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
          아직 다이제스트가 없습니다. 상단의 &quot;GitHub 동기화&quot; 버튼을 눌러
          최신 활동을 가져오고 요약을 생성하세요.
        </div>
      ) : (
        <>
          {data.headline && (
            <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <h2 className="text-sm font-medium">헤드라인</h2>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {timeAgo(data.headline.createdAt)} · 활동{" "}
                    {data.headline.activityCount}건
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {data.headline.summary}
                </p>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              활성 프로젝트 ({data.products.length})
            </h2>
            {data.products.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                최근 14일 동안 활동이 있는 프로덕트가 없습니다.
              </div>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.products.map((p) => (
                  <ProductCard key={p.slug} p={p} />
                ))}
              </ul>
            )}
          </section>

          {data.stale.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                onClick={() => setStaleOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                {staleOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                오래된 프로젝트 ({data.stale.length})
              </button>
              {staleOpen && (
                <ul className="flex flex-col gap-1 text-xs font-mono text-muted-foreground/80 pl-5">
                  {data.stale.map((s) => (
                    <li key={s.slug} className="flex justify-between gap-2">
                      <span className="truncate">
                        {s.name}{" "}
                        <span className="text-muted-foreground/50">
                          [{s.status}]
                        </span>
                      </span>
                      <span className="shrink-0">
                        push {timeAgo(s.lastCommitAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({ p }: { p: ProductDigest }) {
  const url = p.githubRepo ? `https://github.com/${p.githubRepo}` : undefined;
  return (
    <li className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2 hover:bg-card/80 transition-colors">
      <header className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm truncate">{p.name}</span>
            {p.language && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                {p.language}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            활동 {p.activityCount}건 · push {timeAgo(p.lastCommitAt)}
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="GitHub에서 열기"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </header>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.summary}</p>
    </li>
  );
}
