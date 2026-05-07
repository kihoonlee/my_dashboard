// Obsidian vault → DB 동기화 오케스트레이터.
// 1. vault scan → 모든 .md 파일 mtime 수집
// 2. DB 조회 (file_path → lastModified)
// 3. 변경/신규 파일만 read + parse + embed + upsert
// 4. vault에서 삭제된 파일 → DB row 삭제
// 5. 결과 요약 반환

import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { obsidianNotes } from "@/lib/db/schema";
import { scanVault, readFile } from "@/lib/obsidian/scanner";
import { parseNote } from "@/lib/obsidian/parser";
import { embedMany } from "@/lib/openai/embeddings";

export type SyncSummary = {
  scanned: number;
  upserted: number;
  unchanged: number;
  deleted: number;
  errors: string[];
  durationMs: number;
};

export async function syncObsidianVault(): Promise<SyncSummary> {
  const startedAt = Date.now();
  const errors: string[] = [];

  const scanned = await scanVault();

  // DB 현재 상태 (path → lastModified)
  const existingRows = await db
    .select({
      filePath: obsidianNotes.filePath,
      lastModified: obsidianNotes.lastModified,
    })
    .from(obsidianNotes);
  const existing = new Map<string, Date | null>(
    existingRows.map((r) => [r.filePath, r.lastModified]),
  );

  // 변경/신규 후보 분류
  const toProcess: typeof scanned = [];
  let unchanged = 0;
  for (const file of scanned) {
    const dbMtime = existing.get(file.relPath);
    if (!dbMtime) {
      toProcess.push(file);
    } else if (file.mtime.getTime() > dbMtime.getTime() + 999) {
      // mtime은 ms로 비교하되 1초 buffer (FS 정밀도 차이 회피)
      toProcess.push(file);
    } else {
      unchanged += 1;
    }
  }

  // 삭제 대상: DB에는 있는데 vault에는 없는 path
  const scannedPaths = new Set(scanned.map((f) => f.relPath));
  const toDelete = Array.from(existing.keys()).filter(
    (p) => !scannedPaths.has(p),
  );

  // 1. 신규/변경 처리 — read + parse
  type Pending = {
    file: (typeof scanned)[number];
    title: string;
    content: string;
    tags: string[];
    wordCount: number;
    embedInput: string;
  };
  const pending: Pending[] = [];
  for (const file of toProcess) {
    try {
      const raw = await readFile(file.absPath);
      const parsed = parseNote(raw, file.relPath);
      const embedInput = `${parsed.title}\n\n${parsed.content}`.trim();
      if (!embedInput) {
        errors.push(`${file.relPath}: empty content`);
        continue;
      }
      pending.push({
        file,
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
        wordCount: parsed.wordCount,
        embedInput,
      });
    } catch (e) {
      errors.push(
        `${file.relPath}: parse failed — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 2. 임베딩 (배치)
  let embeddings: number[][] = [];
  if (pending.length > 0) {
    try {
      embeddings = await embedMany(pending.map((p) => p.embedInput));
    } catch (e) {
      errors.push(
        `embedding failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      // 임베딩 실패는 전체 sync 실패가 아니라 — 그 batch만 skip하고 메타만 upsert.
      // 안전 옵션은 전체 abort. 여기선 abort 후 caller에 에러 반환.
      return {
        scanned: scanned.length,
        upserted: 0,
        unchanged,
        deleted: 0,
        errors,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  // 3. upsert (file_path 기준)
  let upserted = 0;
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const vec = embeddings[i];
    try {
      // pgvector는 drizzle vector() 컬럼 + 배열 그대로 OK. 단 raw sql 패턴 사용 시 문자열 변환 필요.
      // drizzle insert builder에선 number[] 그대로 통과.
      await db
        .insert(obsidianNotes)
        .values({
          filePath: p.file.relPath,
          title: p.title,
          content: p.content,
          tags: p.tags,
          embedding: vec,
          wordCount: p.wordCount,
          lastModified: p.file.mtime,
        })
        .onConflictDoUpdate({
          target: obsidianNotes.filePath,
          set: {
            title: p.title,
            content: p.content,
            tags: p.tags,
            embedding: vec,
            wordCount: p.wordCount,
            lastModified: p.file.mtime,
            syncedAt: new Date(),
          },
        });
      upserted += 1;
    } catch (e) {
      errors.push(
        `${p.file.relPath}: upsert failed — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 4. 삭제
  let deleted = 0;
  if (toDelete.length > 0) {
    try {
      const res = await db
        .delete(obsidianNotes)
        .where(inArray(obsidianNotes.filePath, toDelete))
        .returning({ id: obsidianNotes.id });
      deleted = res.length;
    } catch (e) {
      errors.push(
        `delete stale failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    scanned: scanned.length,
    upserted,
    unchanged,
    deleted,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

/** Knowledge 탭 등에서 lastSync 같은 메타가 필요할 때 외부에서 사용. */
export async function getNoteCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(obsidianNotes);
  return row?.count ?? 0;
}
