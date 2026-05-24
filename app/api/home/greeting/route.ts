// GET /api/home/greeting — 홈 진입 시 민지 인사 자동 생성 + 6h TTL 캐시.
//
// 캐시 키: KST dateKey + bucket (morning/afternoon/evening/night 4구간 × 6h).
// users.settings_json.homeGreeting에 저장. cache hit이면 LLM 호출 0.
//
// query:
//   - force=true → TTL 안이라도 강제 재생성 ("다시 받기" 버튼)
//
// 응답: { text, bucket, dateKey, cached, costUsd?, durationMs? }

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/api/auth";
import { requestOrigin } from "@/lib/http/origin";

type Bucket = "morning" | "afternoon" | "evening" | "night";

type CachedGreeting = {
  text: string;
  generatedAt: string;
  bucket: Bucket;
  dateKey: string;
  costUsd: number;
};

type StoredSettings = {
  homeGreeting?: CachedGreeting;
};

const PROMPTS: Record<Bucket, string> = {
  morning:
    "사용자가 아침에 홈에 진입했습니다. get_user_context 도구로 최근 일기·메모·todo 패턴을 살핀 뒤, 따뜻한 아침 인사 + 오늘 도움이 될 한 줄을 3-5줄로 전달해주세요.",
  afternoon:
    "사용자가 오후에 홈에 진입했습니다. get_user_context로 최근 패턴을 살피고, 오후를 잘 보낼 한 줄 + 점심 이후 흐름을 의식한 격려를 3-5줄로 전해주세요.",
  evening:
    "사용자가 저녁에 홈에 진입했습니다. get_user_context로 오늘 활동을 가볍게 돌아본 뒤, 하루 마무리에 도움이 될 한 줄을 3-5줄로 전해주세요.",
  night:
    "사용자가 늦은 밤에 홈에 진입했습니다. get_user_context로 오늘 흐름을 살피고, 차분히 마무리하고 쉬도록 돕는 한 줄을 3-5줄로 전해주세요.",
};

function kstNow(): Date {
  // KST = UTC+9
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function currentBucket(): { bucket: Bucket; dateKey: string } {
  const k = kstNow();
  const hour = k.getUTCHours(); // KST 기준
  let bucket: Bucket;
  if (hour < 6) bucket = "night";
  else if (hour < 12) bucket = "morning";
  else if (hour < 18) bucket = "afternoon";
  else bucket = "evening";
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const d = String(k.getUTCDate()).padStart(2, "0");
  return { bucket, dateKey: `${y}-${m}-${d}` };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const url = request.nextUrl;
  const force = url.searchParams.get("force") === "true";

  const { bucket, dateKey } = currentBucket();

  // 캐시 조회
  const [row] = await db
    .select({ settings: users.settingsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const settings = (row?.settings ?? {}) as StoredSettings;
  const cached = settings.homeGreeting;

  if (
    !force &&
    cached &&
    cached.dateKey === dateKey &&
    cached.bucket === bucket
  ) {
    return NextResponse.json({
      text: cached.text,
      bucket: cached.bucket,
      dateKey: cached.dateKey,
      cached: true,
    });
  }

  // miss → assistant 호출
  const baseUrl = requestOrigin(request);
  type InvokeResp = {
    text?: string;
    durationMs?: number;
    costUsd?: number;
    error?: string;
  };

  let invokeOk: InvokeResp;
  try {
    const res = await fetch(`${baseUrl}/api/agents/assistant/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-myhub-internal-call": "1",
        "x-myhub-agent-depth": "0",
        "x-myhub-user-id": userId,
      },
      body: JSON.stringify({
        message: PROMPTS[bucket],
        trigger: `home_greeting_${bucket}`,
      }),
    });
    const body = (await res.json().catch(() => null)) as InvokeResp | null;
    if (!res.ok || !body?.text) {
      return NextResponse.json(
        {
          error: `assistant invoke failed: ${res.status}`,
          detail: body,
        },
        { status: 502 },
      );
    }
    invokeOk = body;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const next: CachedGreeting = {
    text: invokeOk.text!,
    generatedAt: new Date().toISOString(),
    bucket,
    dateKey,
    costUsd: invokeOk.costUsd ?? 0,
  };

  // settings_json.homeGreeting jsonb merge
  const merge = JSON.stringify({ homeGreeting: next });
  await db
    .update(users)
    .set({
      settingsJson: sql`COALESCE(${users.settingsJson}, '{}'::jsonb) || ${merge}::jsonb`,
    })
    .where(eq(users.id, userId));

  return NextResponse.json({
    text: next.text,
    bucket,
    dateKey,
    cached: false,
    costUsd: next.costUsd,
    durationMs: invokeOk.durationMs ?? 0,
  });
}
