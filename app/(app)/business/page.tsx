"use client";

// /business — 13+개 프로덕트 칸반.
// 컬럼: idea / active / paused / archived
// 카드: 이름 + 언어 배지 + 최근 push + 30일 활동(commit/PR/issue) + GitHub 링크 + status 변경.
// "GitHub 동기화" 버튼으로 FlowTo-ai 조직 repo 메타·활동 갱신.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  GitCommit,
  GitPullRequest,
  CircleDot,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  slug: string;
  name: string;
  status: string;
  description: string | null;
  githubRepo: string | null;
  metrics: {
    language?: string | null;
    stars?: number;
    private?: boolean;
    archived?: boolean;
    url?: string;
  } & Record<string, unknown>;
  lastCommitAt: string | null;
  activity30d: {
    commits: number;
    pullRequests: number;
    issues: number;
  };
};

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "active", label: "🚀 진행 중" },
  { key: "paused", label: "⏸ 보류" },
  { key: "idea", label: "💡 아이디어" },
  { key: "archived", label: "📦 보관" },
];

const ALL_STATUSES = COLUMNS.map((c) => c.key);

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "오늘";
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(months / 12)}년 전`;
}

export default function BusinessPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/business/products", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { products: Product[] };
      setProducts(data.products);
    } catch (e) {
      setError(`프로덕트 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function syncGithub() {
    if (syncing) return;
    setSyncing(true);
    setSyncSummary(null);
    setSyncErrors([]);
    setError(null);
    try {
      const res = await fetch("/api/sync/github", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      setSyncSummary(
        `동기화 완료 — ${data.repos}개 repo · ${data.productsUpserted}건 upsert · 활동 ${data.activitiesUpserted}건` +
          (data.errors?.length ? ` · 에러 ${data.errors.length}건` : ""),
      );
      setSyncErrors(Array.isArray(data.errors) ? data.errors : []);
      await fetchProducts();
    } catch (e) {
      setError(`동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function changeStatus(product: Product, nextStatus: string) {
    if (product.status === nextStatus) return;
    // optimistic update
    setProducts((prev) =>
      prev
        ? prev.map((p) =>
            p.id === product.id ? { ...p, status: nextStatus } : p,
          )
        : prev,
    );
    try {
      const res = await fetch(`/api/business/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        // 실패 시 원복
        await fetchProducts();
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `status ${res.status}`);
      }
    } catch (e) {
      setError(`상태 변경 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    void fetchProducts();
  }, []);

  const grouped: Record<string, Product[]> = Object.fromEntries(
    ALL_STATUSES.map((s) => [s, [] as Product[]]),
  );
  for (const p of products ?? []) {
    if (grouped[p.status]) grouped[p.status].push(p);
    else grouped["idea"].push(p);
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">사업 · 프로덕트</h1>
          <p className="text-sm text-muted-foreground">
            FlowTo-ai 조직의 repo 활동 + 프로덕트 상태 칸반.
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

      {syncSummary && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          {syncSummary}
        </div>
      )}
      {syncErrors.length > 0 && (
        <div className="border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-xs flex flex-col gap-1">
          <div className="font-medium">동기화 중 발생한 에러</div>
          <ul className="list-disc list-inside font-mono space-y-0.5 max-h-40 overflow-y-auto">
            {syncErrors.slice(0, 20).map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
            {syncErrors.length > 20 && (
              <li className="opacity-60">...외 {syncErrors.length - 20}건</li>
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

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          로딩 중...
        </div>
      ) : products && products.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
          아직 프로덕트가 없습니다. 상단의 &quot;GitHub 동기화&quot; 버튼을 눌러 FlowTo-ai
          조직의 repo를 가져오세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(({ key, label }) => {
            const items = grouped[key] ?? [];
            return (
              <section
                key={key}
                className="flex flex-col gap-2 border border-border rounded-xl bg-muted/30 p-3 min-h-[200px]"
              >
                <header className="flex items-center justify-between text-xs font-medium px-1 pb-1">
                  <span>{label}</span>
                  <span className="font-mono text-muted-foreground">
                    {items.length}
                  </span>
                </header>
                <div className="flex flex-col gap-2">
                  {items.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground/70 text-center py-4">
                      비어있음
                    </div>
                  ) : (
                    items.map((p) => <ProductCard key={p.id} p={p} onChangeStatus={changeStatus} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  p,
  onChangeStatus,
}: {
  p: Product;
  onChangeStatus: (p: Product, status: string) => void;
}) {
  const lang = p.metrics?.language as string | null | undefined;
  const url = p.metrics?.url as string | undefined;
  const isPrivate = !!p.metrics?.private;

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 hover:bg-card/80 transition-colors">
      <header className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{p.name}</div>
          {p.githubRepo && (
            <div className="text-[10px] font-mono text-muted-foreground truncate">
              {p.githubRepo}
            </div>
          )}
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

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {lang && (
          <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {lang}
          </span>
        )}
        {isPrivate && (
          <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            private
          </span>
        )}
        <span className="text-muted-foreground/80">
          push {timeAgo(p.lastCommitAt)}
        </span>
      </div>

      {(p.activity30d.commits > 0 ||
        p.activity30d.pullRequests > 0 ||
        p.activity30d.issues > 0) && (
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {p.activity30d.commits > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitCommit className="h-3 w-3" />
              {p.activity30d.commits}
            </span>
          )}
          {p.activity30d.pullRequests > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitPullRequest className="h-3 w-3" />
              {p.activity30d.pullRequests}
            </span>
          )}
          {p.activity30d.issues > 0 && (
            <span className="inline-flex items-center gap-1">
              <CircleDot className="h-3 w-3" />
              {p.activity30d.issues}
            </span>
          )}
          <span className="text-muted-foreground/60">/30일</span>
        </div>
      )}

      <select
        value={p.status}
        onChange={(e) => onChangeStatus(p, e.target.value)}
        className={cn(
          "mt-1 text-[11px] bg-transparent border border-border rounded px-2 py-1",
          "focus:outline-none focus:border-primary",
        )}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </article>
  );
}
