// GitHub → DB 동기화 + AI 다이제스트 생성.
//
// 흐름:
// 1. listOrgRepos — 전체 repo 메타
// 2. products upsert (모든 repo)
// 3. status 자동 분류:
//    - archived (GitHub) → "archived"
//    - pushed_at >= now - 14d → "active"
//    - else → "stale"
// 4. archived/stale repo: 활동 수집 skip (메타만 갱신됨)
// 5. active repo만 commits/PRs/issues fetch
// 6. 신규 활동만 추출 (DB의 기존 github_id와 diff)
// 7. 신규 활동이 있는 repo만 LLM 요약 (lib/github/digest.ts) → github_digests upsert
// 8. 모든 product digest를 모아 헤드라인 1회 호출 → github_digests upsert (kind="headline")
// 9. agent_logs에 LLM 호출 기록 (현주 agent_id, trigger="github_digest_*")
// 10. 응답: GithubSyncSummary (totalCostUsd, llmCalls, activeRepos, staleRepos, digests)

import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agents,
  agentLogs,
  githubActivity,
  githubDigests,
  products,
} from "@/lib/db/schema";
import {
  listOrgRepos,
  listRepoCommits,
  listRepoPulls,
  listRepoIssues,
  type GithubRepo,
} from "@/lib/github/client";
import {
  DIGEST_META,
  summarizeHeadline,
  summarizeRepoActivity,
  type RepoActivity,
} from "@/lib/github/digest";

const STALE_DAYS = 14;
const ACTIVITY_LIMIT = 30;

export type GithubSyncSummary = {
  org: string;
  repos: number;
  activeRepos: number;
  staleRepos: number;
  archivedRepos: number;
  productsUpserted: number;
  newActivities: number;
  llmCalls: number;
  totalCostUsd: number;
  digests: Array<{
    slug: string;
    name: string;
    activityCount: number;
    summary: string;
    costUsd: number;
  }>;
  headline: string | null;
  errors: string[];
  durationMs: number;
};

export async function syncGithubOrg(org: string): Promise<GithubSyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];

  // ── 0. 현주 agent_id 조회 (LLM 호출 비용 기록용) ────────────────
  let hyunjuAgentId: string | null = null;
  try {
    const [a] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.englishName, "hyunju"))
      .limit(1);
    hyunjuAgentId = a?.id ?? null;
  } catch (e) {
    errors.push(`hyunju agent lookup failed: ${errMsg(e)}`);
  }

  // ── 1. 조직 repo 메타 ──────────────────────────────────────
  let repos: GithubRepo[];
  try {
    repos = await listOrgRepos(org);
  } catch (e) {
    return {
      org,
      repos: 0,
      activeRepos: 0,
      staleRepos: 0,
      archivedRepos: 0,
      productsUpserted: 0,
      newActivities: 0,
      llmCalls: 0,
      totalCostUsd: 0,
      digests: [],
      headline: null,
      errors: [`listOrgRepos failed: ${errMsg(e)}`],
      durationMs: Date.now() - startedAt,
    };
  }

  // ── 2. status 자동 분류 ────────────────────────────────────
  const staleThreshold = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const classify = (r: GithubRepo): "active" | "stale" | "archived" => {
    if (r.archived) return "archived";
    const pushed = r.pushed_at ? new Date(r.pushed_at).getTime() : 0;
    return pushed >= staleThreshold ? "active" : "stale";
  };

  // ── 3. products upsert (모든 repo, status 자동 갱신) ────────
  let productsUpserted = 0;
  const productIdBySlug = new Map<string, string>();
  const repoStatus = new Map<string, "active" | "stale" | "archived">();

  for (const r of repos) {
    const status = classify(r);
    repoStatus.set(r.name, status);
    try {
      const metrics = {
        language: r.language,
        stars: r.stargazers_count,
        openIssues: r.open_issues_count,
        defaultBranch: r.default_branch,
        url: r.html_url,
        private: r.private,
        archived: r.archived,
      };
      const [row] = await db
        .insert(products)
        .values({
          name: r.name,
          slug: r.name,
          status,
          description: r.description ?? null,
          githubRepo: r.full_name,
          metricsJson: metrics,
          lastCommitAt: r.pushed_at ? new Date(r.pushed_at) : null,
        })
        .onConflictDoUpdate({
          target: products.slug,
          set: {
            name: r.name,
            status, // 자동 분류로 매번 갱신
            description: r.description ?? null,
            githubRepo: r.full_name,
            metricsJson: metrics,
            lastCommitAt: r.pushed_at ? new Date(r.pushed_at) : null,
          },
        })
        .returning({ id: products.id });
      if (row) productIdBySlug.set(r.name, row.id);
      productsUpserted += 1;
    } catch (e) {
      errors.push(`product ${r.full_name}: ${errMsg(e)}`);
    }
  }

  const activeRepos = repos.filter((r) => repoStatus.get(r.name) === "active");
  const staleRepos = repos.filter((r) => repoStatus.get(r.name) === "stale");
  const archivedRepos = repos.filter(
    (r) => repoStatus.get(r.name) === "archived",
  );

  console.log(
    `[github/sync] org=${org} total=${repos.length} active=${activeRepos.length} stale=${staleRepos.length} archived=${archivedRepos.length}`,
  );

  // ── 4-7. active repo별: 활동 수집 → 신규 추출 → 요약 ─────────
  const since = new Date();
  since.setDate(since.getDate() - STALE_DAYS);

  type RepoBucket = {
    repo: GithubRepo;
    productId: string;
    newActivities: RepoActivity[];
  };
  const buckets: RepoBucket[] = [];
  let totalNewActivities = 0;

  for (const r of activeRepos) {
    const productId = productIdBySlug.get(r.name);
    if (!productId) continue;
    const [owner, name] = r.full_name.split("/");

    const fetched: Array<{
      type: "commit" | "pull_request" | "issue";
      githubId: string;
      title: string;
      url: string;
      createdAt: Date;
      raw: unknown;
    }> = [];

    // commits
    try {
      const commits = await listRepoCommits(owner, name, since, ACTIVITY_LIMIT);
      for (const c of commits) {
        const date = c.commit.author?.date;
        if (!date) continue;
        fetched.push({
          type: "commit",
          githubId: c.sha,
          title: firstLine(c.commit.message) || "(빈 메시지)",
          url: c.html_url,
          createdAt: new Date(date),
          raw: c,
        });
      }
    } catch (e) {
      errors.push(`commits ${r.full_name}: ${errMsg(e)}`);
    }

    // PRs
    try {
      const pulls = await listRepoPulls(owner, name, "all", ACTIVITY_LIMIT);
      for (const p of pulls) {
        if (new Date(p.updated_at) < since) continue;
        fetched.push({
          type: "pull_request",
          githubId: String(p.id),
          title: p.title,
          url: p.html_url,
          createdAt: new Date(p.updated_at),
          raw: p,
        });
      }
    } catch (e) {
      errors.push(`pulls ${r.full_name}: ${errMsg(e)}`);
    }

    // issues (PR 제외)
    try {
      const issues = await listRepoIssues(owner, name, "all", ACTIVITY_LIMIT);
      for (const i of issues) {
        if (i.pull_request) continue;
        if (new Date(i.updated_at) < since) continue;
        fetched.push({
          type: "issue",
          githubId: String(i.id),
          title: i.title,
          url: i.html_url,
          createdAt: new Date(i.updated_at),
          raw: i,
        });
      }
    } catch (e) {
      errors.push(`issues ${r.full_name}: ${errMsg(e)}`);
    }

    if (fetched.length === 0) continue;

    // ── 신규 활동 식별: 기존 (type, githubId) set 조회 ───────
    let existingKeys = new Set<string>();
    try {
      const fetchedIds = fetched.map((f) => f.githubId);
      const rows = await db
        .select({
          type: githubActivity.type,
          githubId: githubActivity.githubId,
        })
        .from(githubActivity)
        .where(
          and(
            eq(githubActivity.productId, productId),
            inArray(githubActivity.githubId, fetchedIds),
          ),
        );
      existingKeys = new Set(rows.map((r) => `${r.type}:${r.githubId}`));
    } catch (e) {
      errors.push(`existing lookup ${r.full_name}: ${errMsg(e)}`);
    }

    const newOnes = fetched.filter(
      (f) => !existingKeys.has(`${f.type}:${f.githubId}`),
    );

    // 모두 insert (신규 + 기존; onConflictDoNothing이 보호)
    for (const f of fetched) {
      try {
        await db
          .insert(githubActivity)
          .values({
            productId,
            type: f.type,
            githubId: f.githubId,
            title: f.title,
            url: f.url,
            rawJson: f.raw as Record<string, unknown>,
            createdAt: f.createdAt,
          })
          .onConflictDoNothing({
            target: [githubActivity.type, githubActivity.githubId],
          });
      } catch (e) {
        errors.push(`activity insert ${r.full_name}: ${errMsg(e)}`);
      }
    }

    totalNewActivities += newOnes.length;

    if (newOnes.length > 0) {
      buckets.push({
        repo: r,
        productId,
        newActivities: newOnes.map((n) => ({
          type: n.type,
          title: n.title,
          createdAt: n.createdAt,
        })),
      });
    }
  }

  // ── 8. period 정렬 (당일 00:00 기준 — idempotent) ────────────
  const periodStart = startOfToday();
  const periodEnd = new Date();

  // ── 9. repo별 LLM 요약 ─────────────────────────────────────
  const digests: GithubSyncSummary["digests"] = [];
  let llmCalls = 0;
  let totalCostUsd = 0;

  for (const bucket of buckets) {
    try {
      const result = await summarizeRepoActivity({
        productName: bucket.repo.name,
        repoFullName: bucket.repo.full_name,
        activities: bucket.newActivities,
        periodDays: STALE_DAYS,
      });
      llmCalls += 1;
      totalCostUsd += result.costUsd;

      // github_digests upsert
      await db
        .insert(githubDigests)
        .values({
          productId: bucket.productId,
          kind: "product",
          periodStart,
          periodEnd,
          summary: result.summary,
          activityCount: bucket.newActivities.length,
          model: DIGEST_META.model,
          costUsd: result.costUsd.toFixed(6),
        })
        .onConflictDoUpdate({
          target: [
            githubDigests.productId,
            githubDigests.kind,
            githubDigests.periodStart,
          ],
          set: {
            periodEnd,
            summary: result.summary,
            activityCount: bucket.newActivities.length,
            model: DIGEST_META.model,
            costUsd: result.costUsd.toFixed(6),
          },
        });

      // agent_logs (현주 agent_id 있을 때만)
      if (hyunjuAgentId) {
        await db.insert(agentLogs).values({
          agentId: hyunjuAgentId,
          trigger: "github_digest_repo",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: 0,
          costUsd: result.costUsd.toFixed(6),
          isError: false,
        });
      }

      digests.push({
        slug: bucket.repo.name,
        name: bucket.repo.name,
        activityCount: bucket.newActivities.length,
        summary: result.summary,
        costUsd: result.costUsd,
      });
    } catch (e) {
      errors.push(
        `digest ${bucket.repo.full_name}: ${errMsg(e)}`,
      );
    }
  }

  // ── 10. 헤드라인 LLM 1회 (digests 있을 때만) ────────────────
  let headline: string | null = null;
  if (digests.length > 0) {
    try {
      const result = await summarizeHeadline({
        periodDays: STALE_DAYS,
        productDigests: digests.map((d) => ({
          productName: d.name,
          activityCount: d.activityCount,
          summary: d.summary,
        })),
      });
      llmCalls += 1;
      totalCostUsd += result.costUsd;
      headline = result.summary;

      await db
        .insert(githubDigests)
        .values({
          productId: null,
          kind: "headline",
          periodStart,
          periodEnd,
          summary: result.summary,
          activityCount: digests.reduce((s, d) => s + d.activityCount, 0),
          model: DIGEST_META.model,
          costUsd: result.costUsd.toFixed(6),
        })
        .onConflictDoUpdate({
          target: [
            githubDigests.productId,
            githubDigests.kind,
            githubDigests.periodStart,
          ],
          set: {
            periodEnd,
            summary: result.summary,
            activityCount: digests.reduce((s, d) => s + d.activityCount, 0),
            model: DIGEST_META.model,
            costUsd: result.costUsd.toFixed(6),
          },
        });

      if (hyunjuAgentId) {
        await db.insert(agentLogs).values({
          agentId: hyunjuAgentId,
          trigger: "github_digest_headline",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: 0,
          costUsd: result.costUsd.toFixed(6),
          isError: false,
        });
      }
    } catch (e) {
      errors.push(`headline digest: ${errMsg(e)}`);
    }
  }

  console.log(
    `[github/sync] llmCalls=${llmCalls} cost=$${totalCostUsd.toFixed(6)} newActivities=${totalNewActivities}`,
  );

  return {
    org,
    repos: repos.length,
    activeRepos: activeRepos.length,
    staleRepos: staleRepos.length,
    archivedRepos: archivedRepos.length,
    productsUpserted,
    newActivities: totalNewActivities,
    llmCalls,
    totalCostUsd,
    digests,
    headline,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

function firstLine(s: string | null | undefined): string {
  if (!s) return "";
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

void sql; // drizzle re-export 방어 (다른 파일과 동일 패턴)
