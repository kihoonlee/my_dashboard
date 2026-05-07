// POST /api/agents/[name]/rollback
// body: { version: number }
// 지정 version의 system_prompt를 현재 시스템 프롬프트로 복원.
// 현재 system_prompt는 새 version으로 자동 archive (롤백도 history에 남음).

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agents, agentPromptVersions } from "@/lib/db/schema";

type AgentRow = typeof agents.$inferSelect;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  let body: { version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const version =
    typeof body.version === "number" ? body.version : parseInt(String(body.version ?? ""), 10);
  if (!Number.isFinite(version) || version <= 0) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const [existing] = (await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, name))
    .limit(1)) as AgentRow[];
  if (!existing) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  const [target] = await db
    .select()
    .from(agentPromptVersions)
    .where(
      and(
        eq(agentPromptVersions.agentId, existing.id),
        eq(agentPromptVersions.version, version),
      ),
    )
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  }

  // 현재 prompt를 archive
  const [latest] = await db
    .select({ version: agentPromptVersions.version })
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.agentId, existing.id))
    .orderBy(desc(agentPromptVersions.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  await db.insert(agentPromptVersions).values({
    agentId: existing.id,
    version: nextVersion,
    systemPrompt: existing.systemPrompt,
    changedBy: "user",
    changeNote: `rollback to v${version}`,
  });

  await db
    .update(agents)
    .set({ systemPrompt: target.systemPrompt, updatedAt: new Date() })
    .where(eq(agents.id, existing.id));

  return NextResponse.json({
    ok: true,
    rolledBackTo: version,
    archivedAs: nextVersion,
  });
}
