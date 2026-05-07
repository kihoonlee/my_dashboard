// POST /api/sync/news
// 활성 news_sources에서 RSS feed fetch → news_items upsert.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { syncNewsSources } from "@/lib/news/sync";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  let summary;
  try {
    summary = await syncNewsSources({ userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, ...summary });
}
