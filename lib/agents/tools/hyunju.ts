// 현주(business_manager) 전용 tool 구현체.
// Phase 4 범위:
//   - list_products: 프로덕트 목록 + 30일 활동 카운트
//   - get_product: 단일 프로덕트 상세 + 최근 활동 N개

import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, githubActivity } from "@/lib/db/schema";
import type { AgentTool } from "@/lib/anthropic/client";

export const HYUNJU_TOOLS: AgentTool[] = [
  {
    name: "list_products",
    description:
      "FlowTo-ai 조직의 프로덕트 목록을 status 필터와 함께 반환. 각 프로덕트의 30일 활동(commit/PR/issue 수)도 포함. status 미지정 시 전체.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["idea", "active", "paused", "archived"],
          description: "필터링할 status (선택)",
        },
      },
    },
  },
  {
    name: "get_product",
    description:
      "단일 프로덕트의 상세 + 최근 활동 N개. slug는 GitHub repo 이름 (FlowTo-ai/X에서 X). 사용자가 특정 프로덕트를 물을 때 사용.",
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

export async function runHyunjuTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
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
