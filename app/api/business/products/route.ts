// GET /api/business/products
// 모든 프로덕트 + status별 그룹 + 각 프로덕트의 최근 활동 카운트 (commit/PR/issue).
// /business 칸반 화면용.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, githubActivity } from "@/lib/db/schema";

type Row = {
  id: string;
  slug: string;
  name: string;
  status: string;
  description: string | null;
  github_repo: string | null;
  metrics_json: unknown;
  last_commit_at: string | null;
  commit_count_30d: number;
  pr_count_30d: number;
  issue_count_30d: number;
};

export async function GET() {
  // 30일 윈도우 활동 카운트를 product별로 left join + group by
  const rows = (await db.execute<Row>(sql`
    SELECT
      p.id::text AS id,
      p.slug,
      p.name,
      p.status,
      p.description,
      p.github_repo,
      p.metrics_json,
      p.last_commit_at,
      COUNT(*) FILTER (
        WHERE a.type = 'commit' AND a.created_at >= now() - interval '30 days'
      )::int AS commit_count_30d,
      COUNT(*) FILTER (
        WHERE a.type = 'pull_request' AND a.created_at >= now() - interval '30 days'
      )::int AS pr_count_30d,
      COUNT(*) FILTER (
        WHERE a.type = 'issue' AND a.created_at >= now() - interval '30 days'
      )::int AS issue_count_30d
    FROM ${products} p
    LEFT JOIN ${githubActivity} a ON a.product_id = p.id
    GROUP BY p.id
    ORDER BY p.last_commit_at DESC NULLS LAST
  `)) as unknown as Row[];

  return NextResponse.json({
    products: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      description: r.description,
      githubRepo: r.github_repo,
      metrics:
        r.metrics_json && typeof r.metrics_json === "object"
          ? (r.metrics_json as Record<string, unknown>)
          : {},
      lastCommitAt: r.last_commit_at,
      activity30d: {
        commits: r.commit_count_30d,
        pullRequests: r.pr_count_30d,
        issues: r.issue_count_30d,
      },
    })),
  });
}
