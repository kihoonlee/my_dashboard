// 수민(goal_coach) 전용 tool.
// 목표(goals) + 습관(habits/habit_logs) + Year in Pixels(year_pixels) + 주간 회고(weekly_reviews).
//
// 도구:
//   - list_goals(status?), create_goal(title, description?, type?, targetDate?), update_goal_progress(id, progress)
//   - list_habits(includeArchived?), log_habit(habitId, date?, completed, note?)
//   - get_habit_stats(weeks?) — 최근 N주 완료율
//   - get_year_pixels(year?), set_mood(date, score, note?)
//   - get_weekly_review(weekStart?) — 저장된 회고 조회
//   - generate_weekly_review(weekStart?) — 새로 생성 (LLM 호출)

import { db } from "@/lib/db/client";
import {
  goals,
  habits,
  habitLogs,
  weeklyReviews,
  yearPixels,
} from "@/lib/db/schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { AgentTool } from "@/lib/anthropic/client";
import { generateWeeklyReview } from "@/lib/reviews/weekly";

export const SOOMIN_TOOLS: AgentTool[] = [
  {
    name: "list_goals",
    description: "목표 목록 (분기/연간 등). status 필터 (active/done/paused).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "done", "paused"],
          description: "필터링할 status (선택, 미지정 시 전체)",
        },
      },
    },
  },
  {
    name: "create_goal",
    description: "신규 목표 생성. type=quarter/year/etc.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        type: { type: "string", description: "기본 quarter" },
        targetDate: {
          type: "string",
          description: "ISO date YYYY-MM-DD (선택)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_goal_progress",
    description: "목표 진행률 갱신 (0-100).",
    input_schema: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        progress: { type: "number", description: "0-100" },
      },
      required: ["goalId", "progress"],
    },
  },
  {
    name: "list_habits",
    description: "습관 목록 + 최근 14일 완료율.",
    input_schema: {
      type: "object",
      properties: {
        includeArchived: { type: "boolean", description: "기본 false" },
      },
    },
  },
  {
    name: "log_habit",
    description:
      "습관 완료/미완료 기록 (habit_logs upsert). date 미지정 시 오늘.",
    input_schema: {
      type: "object",
      properties: {
        habitId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD (선택)" },
        completed: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["habitId", "completed"],
    },
  },
  {
    name: "get_habit_stats",
    description: "최근 N주 동안의 습관별 완료율.",
    input_schema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "기본 4, 최대 12",
        },
      },
    },
  },
  {
    name: "get_year_pixels",
    description: "Year in Pixels — 특정 연도의 mood 기록 모두.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "number", description: "기본 올해" },
      },
    },
  },
  {
    name: "set_mood",
    description:
      "특정 날짜의 mood score(1-5)를 기록. 같은 날 재호출 시 덮어쓰기.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        moodScore: { type: "number", description: "1=최악 ~ 5=최고" },
        note: { type: "string" },
      },
      required: ["date", "moodScore"],
    },
  },
  {
    name: "get_weekly_review",
    description:
      "저장된 주간 회고 조회. weekStart는 그 주 월요일(YYYY-MM-DD), 미지정 시 이번 주.",
    input_schema: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "YYYY-MM-DD (월요일)" },
      },
    },
  },
  {
    name: "generate_weekly_review",
    description:
      "주간 회고를 LLM으로 새로 생성. 비용 ~$0.01-0.03 (Sonnet 4.6 1회). 같은 주 재호출 시 덮어쓰기. 사용자가 명시적으로 '회고 만들어줘'라고 할 때만.",
    input_schema: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "YYYY-MM-DD (선택)" },
      },
    },
  },
];

type ToolInput = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

const COLOR_BY_SCORE: Record<number, string> = {
  1: "#dc2626",
  2: "#fb923c",
  3: "#facc15",
  4: "#84cc16",
  5: "#16a34a",
};

export async function runSoominTool(
  name: string,
  input: ToolInput,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "list_goals": {
        const status = asString(input.status);
        const rows = status
          ? await db
              .select()
              .from(goals)
              .where(eq(goals.status, status))
              .orderBy(desc(goals.createdAt))
          : await db.select().from(goals).orderBy(desc(goals.createdAt));
        return { ok: true, result: { count: rows.length, goals: rows } };
      }
      case "create_goal": {
        const title = asString(input.title);
        if (!title) return { ok: false, error: "title is required" };
        const [row] = await db
          .insert(goals)
          .values({
            title,
            description: asString(input.description) ?? null,
            type: asString(input.type) ?? "quarter",
            targetDate: asString(input.targetDate) ?? null,
          })
          .returning();
        return { ok: true, result: row };
      }
      case "update_goal_progress": {
        const goalId = asString(input.goalId);
        const progress = asNumber(input.progress);
        if (!goalId || progress === undefined) {
          return { ok: false, error: "goalId and progress are required" };
        }
        const clamped = Math.max(0, Math.min(100, Math.round(progress)));
        const [row] = await db
          .update(goals)
          .set({
            progress: clamped,
            status: clamped >= 100 ? "done" : "active",
          })
          .where(eq(goals.id, goalId))
          .returning();
        if (!row) return { ok: false, error: `goal ${goalId} not found` };
        return { ok: true, result: row };
      }
      case "list_habits": {
        const includeArchived = input.includeArchived === true;
        const since = new Date();
        since.setDate(since.getDate() - 14);
        const rows = await db.execute<{
          id: string;
          name: string;
          description: string | null;
          archived: boolean;
          color_hex: string | null;
          completed_count: number;
          log_count: number;
        }>(sql`
          SELECT
            h.id::text AS id,
            h.name,
            h.description,
            h.archived,
            h.color_hex,
            COUNT(*) FILTER (WHERE l.completed = true)::int AS completed_count,
            COUNT(l.id)::int AS log_count
          FROM ${habits} h
          LEFT JOIN ${habitLogs} l ON l.habit_id = h.id AND l.date >= ${isoDate(since)}::date
          ${includeArchived ? sql`` : sql`WHERE h.archived = false`}
          GROUP BY h.id
          ORDER BY h.created_at ASC
        `);
        return {
          ok: true,
          result: (rows as unknown as Array<{
            id: string;
            name: string;
            description: string | null;
            archived: boolean;
            color_hex: string | null;
            completed_count: number;
            log_count: number;
          }>).map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            archived: r.archived,
            colorHex: r.color_hex,
            completed14d: r.completed_count,
            logCount14d: r.log_count,
            completionRate14d:
              r.log_count > 0 ? r.completed_count / r.log_count : 0,
          })),
        };
      }
      case "log_habit": {
        const habitId = asString(input.habitId);
        if (!habitId) return { ok: false, error: "habitId is required" };
        const completed = input.completed !== false;
        const date = asString(input.date) ?? isoDate(new Date());
        const note = asString(input.note) ?? null;
        await db
          .insert(habitLogs)
          .values({ habitId, date, completed, note })
          .onConflictDoUpdate({
            target: [habitLogs.habitId, habitLogs.date],
            set: { completed, note },
          });
        return { ok: true, result: { habitId, date, completed, note } };
      }
      case "get_habit_stats": {
        const weeks = Math.max(1, Math.min(12, asNumber(input.weeks) ?? 4));
        const since = new Date();
        since.setDate(since.getDate() - weeks * 7);
        const rows = await db.execute<{
          id: string;
          name: string;
          completed_count: number;
          log_count: number;
        }>(sql`
          SELECT
            h.id::text AS id,
            h.name,
            COUNT(*) FILTER (WHERE l.completed = true)::int AS completed_count,
            COUNT(l.id)::int AS log_count
          FROM ${habits} h
          LEFT JOIN ${habitLogs} l ON l.habit_id = h.id AND l.date >= ${isoDate(since)}::date
          WHERE h.archived = false
          GROUP BY h.id
          ORDER BY h.created_at ASC
        `);
        return {
          ok: true,
          result: {
            weeks,
            since: isoDate(since),
            habits: (rows as unknown as Array<{
              id: string;
              name: string;
              completed_count: number;
              log_count: number;
            }>).map((r) => ({
              id: r.id,
              name: r.name,
              completed: r.completed_count,
              logged: r.log_count,
              completionRate: r.log_count > 0 ? r.completed_count / r.log_count : 0,
            })),
          },
        };
      }
      case "get_year_pixels": {
        const year = asNumber(input.year) ?? new Date().getFullYear();
        const start = `${year}-01-01`;
        const end = `${year + 1}-01-01`;
        const rows = await db
          .select()
          .from(yearPixels)
          .where(and(gte(yearPixels.date, start), lt(yearPixels.date, end)));
        return { ok: true, result: { year, count: rows.length, pixels: rows } };
      }
      case "set_mood": {
        const date = asString(input.date);
        const moodScore = asNumber(input.moodScore);
        if (!date || moodScore === undefined || moodScore < 1 || moodScore > 5) {
          return {
            ok: false,
            error: "date and moodScore (1-5) are required",
          };
        }
        const colorHex = COLOR_BY_SCORE[Math.round(moodScore)];
        await db.execute(sql`
          INSERT INTO year_pixels (date, mood_score, color_hex, note, created_at)
          VALUES (${date}::date, ${moodScore}, ${colorHex}, ${asString(input.note) ?? null}, now())
          ON CONFLICT (date) DO UPDATE SET
            mood_score = EXCLUDED.mood_score,
            color_hex = EXCLUDED.color_hex,
            note = EXCLUDED.note
        `);
        return { ok: true, result: { date, moodScore, colorHex } };
      }
      case "get_weekly_review": {
        const weekStart =
          asString(input.weekStart) ?? isoDate(startOfWeek(new Date()));
        const [row] = await db
          .select()
          .from(weeklyReviews)
          .where(eq(weeklyReviews.weekStart, weekStart))
          .limit(1);
        if (!row) {
          return {
            ok: true,
            result: {
              weekStart,
              review: null,
              note:
                "이 주 회고가 아직 없습니다. generate_weekly_review로 새로 만들거나 사용자에게 /goals 페이지 안내.",
            },
          };
        }
        return { ok: true, result: { weekStart, review: row } };
      }
      case "generate_weekly_review": {
        const weekStart = asString(input.weekStart);
        const r = await generateWeeklyReview(weekStart);
        return {
          ok: true,
          result: r,
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `soomin tool error: ${message}` };
  }
}
