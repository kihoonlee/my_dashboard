// GET /api/business/digests
// 가장 최근의 다이제스트(헤드라인 + 프로덕트별)를 한 번에 반환.
// /business 페이지가 진입 시 호출. 동기화는 별도 (/api/sync/github).

import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { githubDigests, products } from "@/lib/db/schema";

type ProductDigestRow = {
  product_id: string | null;
  slug: string | null;
  name: string | null;
  status: string | null;
  github_repo: string | null;
  language: string | null;
  last_commit_at: string | null;
  summary: string;
  activity_count: number;
  cost_usd: string;
  created_at: string;
  period_start: string;
  period_end: string;
};

type StaleRow = {
  slug: string;
  name: string;
  last_commit_at: string | null;
  status: string;
};

export async function GET() {
  // 1. 가장 최근 헤드라인
  const [headline] = await db
    .select({
      summary: githubDigests.summary,
      activityCount: githubDigests.activityCount,
      periodStart: githubDigests.periodStart,
      periodEnd: githubDigests.periodEnd,
      costUsd: githubDigests.costUsd,
      createdAt: githubDigests.createdAt,
    })
    .from(githubDigests)
    .where(
      and(
        eq(githubDigests.kind, "headline"),
        isNull(githubDigests.productId),
      ),
    )
    .orderBy(desc(githubDigests.periodStart))
    .limit(1);

  // 2. 가장 최근 product digest (각 product마다 최신 1건만)
  const productDigests = (await db.execute<ProductDigestRow>(sql`
    SELECT DISTINCT ON (d.product_id)
      d.product_id::text AS product_id,
      p.slug, p.name, p.status, p.github_repo,
      (p.metrics_json->>'language') AS language,
      p.last_commit_at,
      d.summary, d.activity_count, d.cost_usd, d.created_at,
      d.period_start, d.period_end
    FROM ${githubDigests} d
    JOIN ${products} p ON p.id = d.product_id
    WHERE d.kind = 'product'
    ORDER BY d.product_id, d.period_start DESC
  `)) as unknown as ProductDigestRow[];

  // 3. stale + archived 프로덕트 (digest와 무관 — 단순 메타만 노출)
  const staleRows = (await db.execute<StaleRow>(sql`
    SELECT slug, name, last_commit_at::text AS last_commit_at, status
    FROM ${products}
    WHERE status IN ('stale', 'archived')
    ORDER BY last_commit_at DESC NULLS LAST
  `)) as unknown as StaleRow[];

  return NextResponse.json({
    headline: headline
      ? {
          summary: headline.summary,
          activityCount: headline.activityCount,
          periodStart: headline.periodStart,
          periodEnd: headline.periodEnd,
          costUsd: parseFloat(headline.costUsd),
          createdAt: headline.createdAt,
        }
      : null,
    products: productDigests
      .sort((a, b) => b.activity_count - a.activity_count)
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        status: r.status,
        githubRepo: r.github_repo,
        language: r.language,
        lastCommitAt: r.last_commit_at,
        summary: r.summary,
        activityCount: r.activity_count,
        costUsd: parseFloat(r.cost_usd),
        periodStart: r.period_start,
        periodEnd: r.period_end,
      })),
    stale: staleRows.map((r) => ({
      slug: r.slug,
      name: r.name,
      status: r.status,
      lastCommitAt: r.last_commit_at,
    })),
  });
}
