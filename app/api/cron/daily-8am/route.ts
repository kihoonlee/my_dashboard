// 매일 오전 8시 KST (UTC 23:00) — 데일리 에이전트 자동 실행.
// vercel.json schedule: "0 23 * * *"
//
// 흐름:
//   1) cron secret 검증
//   2) 단일 사용자 userId 확보 (ALLOWED_EMAIL → users.email)
//   3) /api/agents/daily/invoke 를 내부 호출 (JSON 모드).
//      daily 에이전트가 list_yesterday_actions / list_yesterday_memos / list_today_events 호출
//      → 메모/캘린더에서 액션 추출해 create_todo
//      → send_notification(kind="daily_report") 로 리포트 발송.
//   4) 에러는 200 OK + payload에 reason (반복 실패 방지)

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest, getCronUserId } from "@/lib/cron/auth";
import { requestOrigin } from "@/lib/http/origin";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const userId = await getCronUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "no cron user (set ALLOWED_EMAIL)" },
      { status: 400 },
    );
  }

  // self-call: NEXT_PUBLIC_APP_URL은 빌드 타임에 박혀 prod/dev 포트 불일치 위험.
  // 자기 자신 origin(Host 헤더)으로 호출하면 어느 포트든 정확히 자기로 감.
  const baseUrl = requestOrigin(request);
  const message =
    "매일 오전 8시 자동 실행. list_yesterday_actions / list_yesterday_memos / list_today_events 차례로 호출해 어제 활동을 정리하고 오늘 해야 할 일을 추출해 create_todo로 등록한 뒤, 한국어 마크다운으로 작성한 일일 리포트를 send_notification(kind='daily_report')로 발송해.";

  try {
    const res = await fetch(`${baseUrl}/api/agents/daily/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-myhub-internal-call": "1",
        "x-myhub-agent-depth": "0",
        "x-myhub-user-id": userId,
      },
      body: JSON.stringify({ message, trigger: "cron_daily_8am" }),
    });
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reason: `daily invoke failed: ${res.status}`,
        data,
      });
    }
    return NextResponse.json({
      ok: true,
      iterations: data?.iterations,
      durationMs: data?.durationMs,
      costUsd: data?.costUsd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, reason: msg });
  }
}
