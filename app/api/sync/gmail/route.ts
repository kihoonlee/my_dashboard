// POST /api/sync/gmail
// 사용자의 Gmail 받은편지함 최근 N건 동기화 + 미분류 행 AI 우선순위 분류.
// 412 reauth_required: oauth_tokens에 google refresh token 없음 또는 invalid_grant.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { GoogleAuthError, getAccessTokenForUser } from "@/lib/google/calendar";
import { syncGmailInbox } from "@/lib/gmail/sync";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await ensureUser(user);

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForUser(userId);
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReauth) {
      return NextResponse.json(
        { error: "reauth_required", message: e.message },
        { status: 412 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "token_refresh_failed", message: msg },
      { status: 500 },
    );
  }

  let summary;
  try {
    summary = await syncGmailInbox({ userId, accessToken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...summary });
}
