// 스캔 결과 ↔ DB(claude_skills) 동기화.
//
// 흐름:
// 1. ~/.claude/skills/ 스캔
// 2. DB의 scope='global' 행과 name 기준 diff
// 3. 신규 → INSERT, 변경 → UPDATE, 삭제(DB만 있고 디스크에 없음) → DELETE
// 4. lastUsedAt / usageCount는 보존 (사용자 데이터)
// 5. settings_json.lastSkillsSync 기록

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { claudeSkills, users } from "@/lib/db/schema";
import { scanSkillsDirectory, type ScannedSkill } from "@/lib/skills/scanner";

const DEFAULT_SCOPE = "global";

export type SkillsSyncSummary = {
  rootPath: string;
  scanned: number;
  inserted: number;
  updated: number;
  removed: number;
  unchanged: number;
  errors: string[];
  durationMs: number;
};

/**
 * 글로벌 skills 동기화. project skill은 별도 스코프이므로 건드리지 않는다.
 */
export async function syncGlobalSkills(params: {
  rootPath: string;
  userId: string;
}): Promise<SkillsSyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];

  const scan = await scanSkillsDirectory(params.rootPath);
  errors.push(...scan.errors.map((e) => `[scan:${e.name}] ${e.message}`));

  // 기존 글로벌 skill 조회 (scope='global')
  const existing = await db
    .select()
    .from(claudeSkills)
    .where(eq(claudeSkills.scope, DEFAULT_SCOPE));
  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const fsNames = new Set(scan.skills.map((s) => s.name));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let removed = 0;

  for (const skill of scan.skills) {
    const prev = existingByName.get(skill.name);
    if (!prev) {
      try {
        await db.insert(claudeSkills).values(toRow(skill));
        inserted++;
      } catch (e) {
        errors.push(`[insert:${skill.name}] ${errMsg(e)}`);
      }
      continue;
    }

    if (skillUnchanged(prev, skill)) {
      unchanged++;
      continue;
    }

    try {
      await db
        .update(claudeSkills)
        .set({
          description: skill.description,
          category: skill.category,
          version: skill.version,
          filePath: skill.filePath,
          tags: skill.tags,
          // usageCount, lastUsedAt 등 사용자 데이터는 유지
        })
        .where(eq(claudeSkills.id, prev.id));
      updated++;
    } catch (e) {
      errors.push(`[update:${skill.name}] ${errMsg(e)}`);
    }
  }

  // 디스크에 없고 DB에만 있는 skill 삭제 (단, file_path가 rootPath 하위인 경우만)
  for (const prev of existing) {
    if (fsNames.has(prev.name)) continue;
    if (!prev.filePath || !prev.filePath.startsWith(params.rootPath)) continue;
    try {
      await db.delete(claudeSkills).where(eq(claudeSkills.id, prev.id));
      removed++;
    } catch (e) {
      errors.push(`[delete:${prev.name}] ${errMsg(e)}`);
    }
  }

  // settings_json.lastSkillsSync 기록
  const summary = {
    at: new Date().toISOString(),
    scanned: scan.skills.length,
    inserted,
    updated,
    removed,
    unchanged,
  };
  try {
    await db
      .update(users)
      .set({
        settingsJson: sql`
          COALESCE(${users.settingsJson}, '{}'::jsonb)
          || jsonb_build_object('lastSkillsSync', ${JSON.stringify(summary)}::jsonb)
        `,
      })
      .where(eq(users.id, params.userId));
  } catch (e) {
    errors.push(`[settings] ${errMsg(e)}`);
  }

  return {
    rootPath: params.rootPath,
    scanned: scan.skills.length,
    inserted,
    updated,
    removed,
    unchanged,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

function toRow(skill: ScannedSkill) {
  return {
    name: skill.name,
    description: skill.description,
    scope: DEFAULT_SCOPE,
    category: skill.category,
    version: skill.version,
    filePath: skill.filePath,
    tags: skill.tags,
  };
}

function skillUnchanged(
  prev: typeof claudeSkills.$inferSelect,
  next: ScannedSkill,
): boolean {
  // 메타 필드 비교 (사용자 편집 가능한 description 등도 frontmatter가 우선이라
  // 변경 감지하면 덮어쓴다 — frontmatter는 source of truth)
  if (prev.filePath !== next.filePath) return false;
  if ((prev.description ?? null) !== (next.description ?? null)) return false;
  if ((prev.category ?? null) !== (next.category ?? null)) return false;
  if ((prev.version ?? null) !== (next.version ?? null)) return false;
  const prevTags = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];
  const nextTags = next.tags;
  if (prevTags.length !== nextTags.length) return false;
  if (prevTags.join("|") !== nextTags.join("|")) return false;
  return true;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
