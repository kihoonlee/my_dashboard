// POST /api/sync/skills
// ~/.claude/skills/<name>/SKILL.md 디렉토리를 스캔해서 claude_skills 테이블 동기화.
// CLAUDE_SKILLS_PATH env 우선, 없으면 ~/.claude/skills 기본값.

import { NextResponse } from "next/server";
import { homedir } from "os";
import { join } from "path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { syncGlobalSkills } from "@/lib/skills/sync";

function defaultPath(): string {
  return process.env.CLAUDE_SKILLS_PATH || join(homedir(), ".claude", "skills");
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const rootPath = defaultPath();

  let summary;
  try {
    summary = await syncGlobalSkills({ rootPath, userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "sync_failed", message: msg, rootPath },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...summary });
}
