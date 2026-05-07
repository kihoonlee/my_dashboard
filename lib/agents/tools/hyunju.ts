// 현주(business_manager) 전용 tool 구현체.
// Phase 4-2 범위 — 다이제스트 중심:
//   - get_recent_digest: 최신 헤드라인 + product digest 묶음 (사용자가 "최근 어떤 일?" 물을 때)
//   - get_product_digest: 특정 프로덕트의 최근 다이제스트 (slug 기반)
//   - list_products: status별 프로덕트 목록 (raw 데이터)
//   - get_product: 단일 프로덕트 raw 활동 (깊이 봐야 할 때)

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, githubActivity, githubDigests } from "@/lib/db/schema";
import type { AgentTool } from "@/lib/anthropic/client";

export const HYUNJU_TOOLS: AgentTool[] = [
  {
    name: "get_recent_digest",
    description:
      "최신 GitHub 활동 다이제스트 — 헤드라인(전체 종합) + 활성 프로덕트별 요약을 한 번에 반환. 사용자가 '최근 뭐 했어?', '이번 주 어떤 일 있었어?' 같은 질문을 하면 가장 먼저 호출.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_product_digest",
    description:
      "특정 프로덕트의 최근 다이제스트(요약) 1-3개. 사용자가 'X 프로덕트 어떻게 돼가?' 물을 때 사용. raw commit 목록은 get_product 사용.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "프로덕트 slug (= repo 이름)" },
        limit: {
          type: "number",
          description: "최대 다이제스트 수 (기본 3, 최대 10)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "list_products",
    description:
      "프로덕트 목록을 status 필터와 함께 반환. status는 sync 시 자동 분류 — active(14일 내 push) / stale / archived. 다이제스트만으로 부족하고 raw 카운트가 필요할 때.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "stale", "archived"],
          description: "필터링할 status (선택)",
        },
      },
    },
  },
  {
    name: "get_product",
    description:
      "단일 프로덕트의 raw 최근 활동(commit/PR/issue) N개. 다이제스트가 부족하고 구체적 commit 목록이 필요할 때만 사용 — 정상 케이스는 get_product_digest 우선.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "프로덕트 slug (= repo 이름)" },
        activityLimit: {
          type: "number",
          description: "최근 활동 몇 개 가져올지 (기본 10, 최대 30)",
        },
      },
      required: ["slug"],
    },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

type ListRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  description: string | null;
  github_repo: string | null;
  language: string | null;
  last_commit_at: string | null;
  commit_count_30d: number;
  pr_count_30d: number;
  issue_count_30d: number;
};

type ProductDigestRow = {
  slug: string;
  name: string;
  status: string;
  language: string | null;
  last_commit_at: string | null;
  summary: string;
  activity_count: number;
  period_start: string;
};

export async function runHyunjuTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "get_recent_digest": {
        const [headline] = await db
          .select({
            summary: githubDigests.summary,
            activityCount: githubDigests.activityCount,
            periodStart: githubDigests.periodStart,
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

        const productDigests = (await db.execute<ProductDigestRow>(sql`
          SELECT DISTINCT ON (d.product_id)
            p.slug, p.name, p.status,
            (p.metrics_json->>'language') AS language,
            p.last_commit_at,
            d.summary, d.activity_count, d.period_start
          FROM ${githubDigests} d
          JOIN ${products} p ON p.id = d.product_id
          WHERE d.kind = 'product'
          ORDER BY d.product_id, d.period_start DESC
        `)) as unknown as ProductDigestRow[];

        return {
          ok: true,
          result: {
            headline: headline
              ? {
                  summary: headline.summary,
                  activityCount: headline.activityCount,
                  generatedAt: headline.createdAt,
                  periodStart: headline.periodStart,
                }
              : null,
            products: productDigests
              .sort((a, b) => b.activity_count - a.activity_count)
              .map((r) => ({
                slug: r.slug,
                name: r.name,
                status: r.status,
                language: r.language,
                lastCommitAt: r.last_commit_at,
                summary: r.summary,
                activityCount: r.activity_count,
              })),
            note:
              !headline && productDigests.length === 0
                ? "다이제스트가 비어있습니다. 사용자에게 /business 페이지에서 'GitHub 동기화'를 눌러달라고 안내하세요."
                : undefined,
          },
        };
      }
      case "get_product_digest": {
        const slug = asString(input.slug);
        if (!slug) return { ok: false, error: "slug is required" };
        const limitRaw =
          typeof input.limit === "number"
            ? input.limit
            : parseInt(asString(input.limit) ?? "3", 10);
        const limit = Math.max(1, Math.min(10, limitRaw || 3));

        const [product] = await db
          .select({ id: products.id, name: products.name, slug: products.slug })
          .from(products)
          .where(eq(products.slug, slug))
          .limit(1);
        if (!product) return { ok: false, error: `product not found: ${slug}` };

        const rows = await db
          .select({
            summary: githubDigests.summary,
            activityCount: githubDigests.activityCount,
            periodStart: githubDigests.periodStart,
            periodEnd: githubDigests.periodEnd,
            createdAt: githubDigests.createdAt,
          })
          .from(githubDigests)
          .where(
            and(
              eq(githubDigests.kind, "product"),
              eq(githubDigests.productId, product.id),
            ),
          )
          .orderBy(desc(githubDigests.periodStart))
          .limit(limit);

        return {
          ok: true,
          result: {
            slug: product.slug,
            name: product.name,
            digests: rows,
          },
        };
      }
      case "list_products": {
        const status = asString(input.status);
        const where = status
          ? sql`WHERE p.status = ${status}`
          : sql`WHERE 1=1`;
        const rows = (await db.execute<ListRow>(sql`
          SELECT
            p.id::text AS id,
            p.slug, p.name, p.status, p.description, p.github_repo,
            (p.metrics_json->>'language') AS language,
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
          ${where}
          GROUP BY p.id
          ORDER BY p.last_commit_at DESC NULLS LAST
        `)) as unknown as ListRow[];

        return {
          ok: true,
          result: {
            count: rows.length,
            products: rows.map((r) => ({
              slug: r.slug,
              name: r.name,
              status: r.status,
              description: r.description,
              githubRepo: r.github_repo,
              language: r.language,
              lastCommitAt: r.last_commit_at,
              activity30d: {
                commits: r.commit_count_30d,
                pullRequests: r.pr_count_30d,
                issues: r.issue_count_30d,
              },
            })),
          },
        };
      }
      case "get_product": {
        const slug = asString(input.slug);
        if (!slug) return { ok: false, error: "slug is required" };
        const limitRaw =
          typeof input.activityLimit === "number"
            ? input.activityLimit
            : parseInt(asString(input.activityLimit) ?? "10", 10);
        const activityLimit = Math.max(1, Math.min(30, limitRaw || 10));

        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.slug, slug))
          .limit(1);
        if (!product) return { ok: false, error: `product not found: ${slug}` };

        const activities = await db
          .select({
            type: githubActivity.type,
            title: githubActivity.title,
            url: githubActivity.url,
            createdAt: githubActivity.createdAt,
          })
          .from(githubActivity)
          .where(eq(githubActivity.productId, product.id))
          .orderBy(desc(githubActivity.createdAt))
          .limit(activityLimit);

        return {
          ok: true,
          result: {
            slug: product.slug,
            name: product.name,
            status: product.status,
            description: product.description,
            githubRepo: product.githubRepo,
            metrics: product.metricsJson,
            lastCommitAt: product.lastCommitAt,
            recentActivity: activities,
          },
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `hyunju tool error: ${message}` };
  }
}
