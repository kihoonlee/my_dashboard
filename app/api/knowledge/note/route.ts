// GET /api/knowledge/note?path=...
// 단일 노트 본문 조회 (검색 결과에서 클릭 시 사용).

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { obsidianNotes } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: obsidianNotes.id,
      filePath: obsidianNotes.filePath,
      title: obsidianNotes.title,
      content: obsidianNotes.content,
      tags: obsidianNotes.tags,
      wordCount: obsidianNotes.wordCount,
      lastModified: obsidianNotes.lastModified,
      syncedAt: obsidianNotes.syncedAt,
    })
    .from(obsidianNotes)
    .where(eq(obsidianNotes.filePath, path))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ note: row });
}
