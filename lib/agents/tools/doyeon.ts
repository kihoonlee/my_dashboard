// 도연(dev_tools_manager) 전용 tool.
// claude_skills + skill_usage_logs 메타데이터 관리.
//
// 도구:
//   - list_skills(scope?, category?, archivedIncluded?)
//   - get_skill(name): 단일 skill 메타 + 최근 사용 5건
//   - add_skill(name, description, scope, category?, version?, filePath?, tags?)
//   - update_skill(id, ...): 메타 부분 갱신
//   - delete_skill(id)
//   - log_skill_usage(skillId, context?)
//   - get_skill_stats(): 카테고리별 카운트 + 최근 30일 사용 빈도 + 미사용 candidates

import { db } from "@/lib/db/client";
import { claudeSkills, skillUsageLogs } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";

export const DOYEON_TOOLS: AgentTool[] = [
  {
    name: "list_skills",
    description:
      "Claude Code skill 목록. scope로 global/project 필터, category로 카테고리 필터.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["global", "project"] },
        category: { type: "string" },
      },
    },
  },
  {
    name: "get_skill",
    description: "Skill 이름으로 단일 메타 + 최근 사용 로그 5건.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "add_skill",
    description:
      "신규 skill 등록. filePath는 ~/.claude/skills/<name>.md 같은 절대 경로 권장. tags는 검색용.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        scope: { type: "string", enum: ["global", "project"] },
        category: { type: "string" },
        version: { type: "string" },
        filePath: { type: "string" },
        projectPath: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    name: "update_skill",
    description: "Skill 메타 부분 갱신.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        version: { type: "string" },
        filePath: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_skill",
    description: "Skill 메타 삭제 (관련 사용 로그도 cascade).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "log_skill_usage",
    description:
      "Skill 사용 기록. usage_count + last_used_at 자동 갱신. context는 어디서 썼는지 짧은 메모.",
    input_schema: {
      type: "object",
      properties: {
        skillId: { type: "string" },
        context: { type: "string" },
      },
      required: ["skillId"],
    },
  },
  {
    name: "get_skill_stats",
    description:
      "전체 통계: 카테고리별 카운트 / 최근 30일 사용 빈도 top / 30일 이상 미사용 후보 (정리 제안).",
    input_schema: { type: "object", properties: {} },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export async function runDoyeonTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "list_skills": {
        const scope = asString(input.scope);
        const category = asString(input.category);
        const conditions = [];
        if (scope) conditions.push(eq(claudeSkills.scope, scope));
        if (category) conditions.push(eq(claudeSkills.category, category));

        const rows = await db
          .select()
          .from(claudeSkills)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(claudeSkills.lastUsedAt));
        return { ok: true, result: { count: rows.length, skills: rows } };
      }
      case "get_skill": {
        const skillName = asString(input.name);
        if (!skillName) return { ok: false, error: "name is required" };
        const [skill] = await db
          .select()
          .from(claudeSkills)
          .where(eq(claudeSkills.name, skillName))
          .limit(1);
        if (!skill) return { ok: false, error: `skill not found: ${skillName}` };

        const usage = await db
          .select()
          .from(skillUsageLogs)
          .where(eq(skillUsageLogs.skillId, skill.id))
          .orderBy(desc(skillUsageLogs.usedAt))
          .limit(5);

        return { ok: true, result: { skill, recentUsage: usage } };
      }
      case "add_skill": {
        const n = asString(input.name);
        if (!n) return { ok: false, error: "name is required" };
        const [row] = await db
          .insert(claudeSkills)
          .values({
            name: n,
            description: asString(input.description) ?? null,
            scope: asString(input.scope) ?? "global",
            category: asString(input.category) ?? null,
            version: asString(input.version) ?? null,
            filePath: asString(input.filePath) ?? null,
            projectPath: asString(input.projectPath) ?? null,
            tags: asStringArray(input.tags),
          })
          .returning();
        return { ok: true, result: row };
      }
      case "update_skill": {
        const id = asString(input.id);
        if (!id) return { ok: false, error: "id is required" };
        const update: Record<string, unknown> = {};
        if (input.description !== undefined)
          update.description = asString(input.description) ?? null;
        if (input.category !== undefined) update.category = asString(input.category) ?? null;
        if (input.version !== undefined) update.version = asString(input.version) ?? null;
        if (input.filePath !== undefined) update.filePath = asString(input.filePath) ?? null;
        if (Array.isArray(input.tags)) update.tags = asStringArray(input.tags);
        if (Object.keys(update).length === 0) {
          return { ok: false, error: "no fields to update" };
        }
        const [row] = await db
          .update(claudeSkills)
          .set(update)
          .where(eq(claudeSkills.id, id))
          .returning();
        if (!row) return { ok: false, error: `skill ${id} not found` };
        return { ok: true, result: row };
      }
      case "delete_skill": {
        const id = asString(input.id);
        if (!id) return { ok: false, error: "id is required" };
        await db.delete(claudeSkills).where(eq(claudeSkills.id, id));
        return { ok: true, result: { id, deleted: true } };
      }
      case "log_skill_usage": {
        const skillId = asString(input.skillId);
        if (!skillId) return { ok: false, error: "skillId is required" };
        const context = asString(input.context) ?? null;

        await db.insert(skillUsageLogs).values({ skillId, context });
        await db
          .update(claudeSkills)
          .set({
            usageCount: sql`${claudeSkills.usageCount} + 1`,
            lastUsedAt: new Date(),
          })
          .where(eq(claudeSkills.id, skillId));

        return { ok: true, result: { skillId, logged: true } };
      }
      case "get_skill_stats": {
        const byCategory = (await db.execute<{ category: string; cnt: number }>(sql`
          SELECT COALESCE(category, '미분류') AS category, COUNT(*)::int AS cnt
          FROM ${claudeSkills}
          GROUP BY category
          ORDER BY cnt DESC
        `)) as unknown as Array<{ category: string; cnt: number }>;

        const top30d = (await db.execute<{
          name: string;
          uses: number;
        }>(sql`
          SELECT s.name, COUNT(l.id)::int AS uses
          FROM ${claudeSkills} s
          LEFT JOIN ${skillUsageLogs} l ON l.skill_id = s.id AND l.used_at >= now() - interval '30 days'
          GROUP BY s.id, s.name
          HAVING COUNT(l.id) > 0
          ORDER BY uses DESC
          LIMIT 10
        `)) as unknown as Array<{ name: string; uses: number }>;

        const stale = (await db.execute<{
          id: string;
          name: string;
          last_used_at: Date | null;
        }>(sql`
          SELECT s.id::text AS id, s.name, s.last_used_at
          FROM ${claudeSkills} s
          WHERE s.last_used_at IS NULL OR s.last_used_at < now() - interval '30 days'
          ORDER BY s.last_used_at NULLS FIRST
          LIMIT 20
        `)) as unknown as Array<{ id: string; name: string; last_used_at: Date | null }>;

        return {
          ok: true,
          result: {
            totalSkills: byCategory.reduce((acc, r) => acc + r.cnt, 0),
            byCategory,
            top30d,
            staleCandidates: stale,
            note:
              stale.length > 5
                ? "30일 이상 사용 안 된 skill이 5개 이상입니다. 정리 제안 권장."
                : undefined,
          },
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `doyeon tool error: ${message}` };
  }
}
