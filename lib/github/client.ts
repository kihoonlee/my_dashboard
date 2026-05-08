// GitHub REST API 클라이언트.
// 인증 우선순위: api_keys 테이블 → GITHUB_PAT 환경변수 → `gh auth token` CLI fallback.
// 모두 lib/secrets/resolver.ts에서 일괄 처리.
// 호출 패턴: 직접 fetch (Octokit 의존성 회피). pagination은 필요 시점에 별도 헬퍼.

import "server-only";
import { resolveApiKey } from "@/lib/secrets/resolver";

const GITHUB_API = "https://api.github.com";
const COMMON_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export async function getGithubToken(): Promise<string> {
  const token = await resolveApiKey("github");
  if (!token) {
    throw new Error(
      "GitHub token not available. Set it in /settings, GITHUB_PAT in .env.local, or run `gh auth login`.",
    );
  }
  return token;
}

export async function githubFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const token = await getGithubToken();
  const res = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GitHub API ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

// ───────────────────────────────────────────────────────────
// 도메인 helper (필요한 만큼만)
// ───────────────────────────────────────────────────────────

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  default_branch: string;
  html_url: string;
  pushed_at: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
};

export async function listOrgRepos(org: string): Promise<GithubRepo[]> {
  // 조직 repo는 보통 100개 이내 — pagination은 100개 한 페이지로 충분.
  // type=all: private+public, sort=pushed (가장 최근 push 순).
  const repos = await githubFetch<GithubRepo[]>(
    `/orgs/${encodeURIComponent(org)}/repos?per_page=100&type=all&sort=pushed`,
  );
  return repos;
}

export type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
  author: { login: string } | null;
};

export async function listRepoCommits(
  owner: string,
  repo: string,
  since?: Date,
  limit = 20,
): Promise<GithubCommit[]> {
  const sinceParam = since ? `&since=${since.toISOString()}` : "";
  return await githubFetch<GithubCommit[]>(
    `/repos/${owner}/${repo}/commits?per_page=${limit}${sinceParam}`,
  );
}

export type GithubPull = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  draft: boolean;
  user: { login: string } | null;
};

export async function listRepoPulls(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  limit = 20,
): Promise<GithubPull[]> {
  return await githubFetch<GithubPull[]>(
    `/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}`,
  );
}

export type GithubIssue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown; // 존재하면 PR (issue API는 PR도 함께 반환)
  user: { login: string } | null;
};

export async function listRepoIssues(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  limit = 20,
): Promise<GithubIssue[]> {
  return await githubFetch<GithubIssue[]>(
    `/repos/${owner}/${repo}/issues?state=${state}&sort=updated&direction=desc&per_page=${limit}`,
  );
}
