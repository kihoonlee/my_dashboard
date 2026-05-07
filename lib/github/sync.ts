// GitHub → DB 동기화 오케스트레이터.
// 1. 조직 repo 목록 → products upsert (slug = repo name)
// 2. 각 repo: 최근 commit/PR/issue 수집 → github_activity upsert (type+github_id unique)
// 3. 결과 요약 반환
//
// 첫 실행 시 신규 product의 status는 archived 여부로 기본 분류:
//   - archived=true → "archived"
//   - archived=false → "active"
// 기존 product가 있으면 status는 그대로 (사용자 분류 보존).

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, githubActivity } from "@/lib/db/schema";
import {
  listOrgRepos,
  listRepoCommits,
  listRepoPulls,
  listRepoIssues,
  type GithubRepo,
} from "@/lib/github/client";

const ACTIVITY_LOOKBACK_DAYS = 30;
const ACTIVITY_LIMIT = 20;

export type GithubSyncSummary = {
  org: string;
  repos: number;
  productsUpserted: number;
  activitiesUpserted: number;
  errors: string[];
  durationMs: number;
};

export async function syncGithubOrg(org: string): Promise<GithubSyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];

  let repos: GithubRepo[];
  try {
    repos = await listOrgRepos(org);
  } catch (e) {
    return {
      org,
      repos: 0,
      productsUpserted: 0,
      activitiesUpserted: 0,
      errors: [`listOrgRepos failed: ${errMsg(e)}`],
      durationMs: Date.now() - startedAt,
    };
  }

  // 1. products upsert
  let productsUpserted = 0;
  const productIdBySlug = new Map<string, string>();
  for (const r of repos) {
    try {
      const slug = r.name;
      const fullName = r.full_name;
      const initialStatus = r.archived ? "archived" : "active";
      const metrics = {
        language: r.language,
        stars: r.stargazers_count,
        openIssues: r.open_issues_count,
        defaultBranch: r.default_branch,
        url: r.html_url,
        private: r.private,
        archived: r.archived,
      };

      // INSERT ... ON CONFLICT — 기존 row가 있으면 메타만 갱신, status는 보존.
      const [row] = await db
        .insert(products)
        .values({
          name: r.name,
          slug,
          status: initialStatus,
          description: r.description ?? null,
          githubRepo: fullName,
          metricsJson: metrics,
          lastCommitAt: r.pushed_at ? new Date(r.pushed_at) : null,
        })
        .onConflictDoUpdate({
          target: products.slug,
          set: {
            name: r.name,
            description: r.description ?? null,
            githubRepo: fullName,
            metricsJson: metrics,
            lastCommitAt: r.pushed_at ? new Date(r.pushed_at) : null,
            // status는 의도적으로 갱신 안 함 — 사용자 수동 분류 보존.
            // 단, repo가 archived로 바뀌면 자동 반영.
            ...(r.archived ? { status: "archived" } : {}),
          },
        })
        .returning({ id: products.id });
      if (row) productIdBySlug.set(slug, row.id);
      productsUpserted += 1;
    } catch (e) {
      errors.push(`product ${r.full_name}: ${errMsg(e)}`);
    }
  }

  // 2. 각 repo의 최근 활동 수집
  const since = new Date();
  since.setDate(since.getDate() - ACTIVITY_LOOKBACK_DAYS);

  let activitiesUpserted = 0;
  for (const r of repos) {
    if (r.archived) continue; // archived는 활동 안 수집
    const productId = productIdBySlug.get(r.name);
    if (!productId) continue;

    const [owner, name] = r.full_name.split("/");

    // commits
    try {
      const commits = await listRepoCommits(owner, name, since, ACTIVITY_LIMIT);
      for (const c of commits) {
        const date = c.commit.author?.date;
        if (!date) continue;
        await db
          .insert(githubActivity)
          .values({
            productId,
            type: "commit",
            githubId: c.sha,
            title: firstLine(c.commit.message),
            url: c.html_url,
            rawJson: c as unknown as Record<string, unknown>,
            createdAt: new Date(date),
          })
          .onConflictDoNothing({
            target: [githubActivity.type, githubActivity.githubId],
          });
        activitiesUpserted += 1;
      }
    } catch (e) {
      errors.push(`commits ${r.full_name}: ${errMsg(e)}`);
    }

    // pulls
    try {
      const pulls = await listRepoPulls(owner, name, "all", ACTIVITY_LIMIT);
      for (const p of pulls) {
        await db
          .insert(githubActivity)
          .values({
            productId,
            type: "pull_request",
            githubId: String(p.id),
            title: p.title,
            url: p.html_url,
            rawJson: p as unknown as Record<string, unknown>,
            createdAt: new Date(p.updated_at),
          })
          .onConflictDoUpdate({
            target: [githubActivity.type, githubActivity.githubId],
            set: {
              title: p.title,
              url: p.html_url,
              rawJson: p as unknown as Record<string, unknown>,
              createdAt: new Date(p.updated_at),
            },
          });
        activitiesUpserted += 1;
      }
    } catch (e) {
      errors.push(`pulls ${r.full_name}: ${errMsg(e)}`);
    }

    // issues (PR은 issues API에도 나오므로 pull_request 필드로 필터)
    try {
      const issues = await listRepoIssues(owner, name, "all", ACTIVITY_LIMIT);
      for (const i of issues) {
        if (i.pull_request) continue; // PR은 위에서 처리
        await db
          .insert(githubActivity)
          .values({
            productId,
            type: "issue",
            githubId: String(i.id),
            title: i.title,
            url: i.html_url,
            rawJson: i as unknown as Record<string, unknown>,
            createdAt: new Date(i.updated_at),
          })
          .onConflictDoUpdate({
            target: [githubActivity.type, githubActivity.githubId],
            set: {
              title: i.title,
              url: i.html_url,
              rawJson: i as unknown as Record<string, unknown>,
              createdAt: new Date(i.updated_at),
            },
          });
        activitiesUpserted += 1;
      }
    } catch (e) {
      errors.push(`issues ${r.full_name}: ${errMsg(e)}`);
    }
  }

  return {
    org,
    repos: repos.length,
    productsUpserted,
    activitiesUpserted,
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

// 표면 가시성: 진행 모니터링용 console.log (sync.ts와 동일 패턴)
const _logging = void (() => {
  // intentionally empty — placeholder for future trace points
})();
void _logging;

// 외부 ref (eq 등) 미사용 경고 회피를 위한 placeholder (drizzle re-export 안전성 확보용)
void eq;
void sql;
