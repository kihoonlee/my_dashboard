// 매시간 — GitHub 활동 동기화 + 다이제스트 (Pro tier 필요).
// vercel.json schedule: "0 * * * *"

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";
import { syncGithubOrg } from "@/lib/github/sync";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const org = process.env.GITHUB_ORG?.trim() || "FlowTo-ai";

  try {
    const summary = await syncGithubOrg(org);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/hourly] github sync failed:", msg);
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 500 },
    );
  }
}
