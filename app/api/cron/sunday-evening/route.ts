// 일요일 저녁 21시 (KST) — 주간 회고 자동 생성.
// vercel.json schedule: "0 12 * * 0" (UTC 일요일 12시 = KST 일요일 21시)

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";
import { generateWeeklyReview } from "@/lib/reviews/weekly";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const r = await generateWeeklyReview();
    return NextResponse.json({
      ok: true,
      weekStart: r.weekStart,
      todosCompleted: r.todosCompleted,
      habitsCompletionRate: r.habitsCompletionRate,
      githubCommits: r.githubCommits,
      obsidianNotesCreated: r.obsidianNotesCreated,
      costUsd: r.costUsd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/sunday] weekly review failed:", msg);
    return NextResponse.json(
      { error: "generate_failed", message: msg },
      { status: 500 },
    );
  }
}
