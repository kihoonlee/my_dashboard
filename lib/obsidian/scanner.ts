// Obsidian vault 스캐너.
// vault root path 아래 .md 파일을 재귀 walk. 무시 폴더(.obsidian / .trash / node_modules / 점파일).
// 반환: { relPath, absPath, mtime, size }[].
// mtime은 변경 감지에 사용 — DB의 lastModified와 비교.

import "server-only";
import { promises as fs } from "fs";
import { join, relative } from "path";

export type ScannedFile = {
  relPath: string;
  absPath: string;
  mtime: Date;
  size: number;
};

const IGNORED_NAMES = new Set([
  ".obsidian",
  ".trash",
  ".git",
  "node_modules",
  ".DS_Store",
]);

export function getVaultPath(): string {
  const p = process.env.OBSIDIAN_VAULT_PATH;
  if (!p) {
    throw new Error(
      "OBSIDIAN_VAULT_PATH is not set in environment (.env.local).",
    );
  }
  return p;
}

export async function scanVault(vaultPath?: string): Promise<ScannedFile[]> {
  const root = vaultPath ?? getVaultPath();
  const out: ScannedFile[] = [];
  await walk(root, root, out);
  return out;
}

async function walk(root: string, dir: string, out: ScannedFile[]): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    // 권한 등으로 못 읽으면 그 디렉토리만 skip
    console.warn(`[obsidian/scanner] readdir failed: ${dir}`, e);
    return;
  }
  for (const ent of entries) {
    if (IGNORED_NAMES.has(ent.name)) continue;
    if (ent.name.startsWith(".")) continue; // 다른 dotfile/dot dir도 skip
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(root, abs, out);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
      try {
        const stat = await fs.stat(abs);
        out.push({
          relPath: relative(root, abs),
          absPath: abs,
          mtime: stat.mtime,
          size: stat.size,
        });
      } catch (e) {
        console.warn(`[obsidian/scanner] stat failed: ${abs}`, e);
      }
    }
  }
}

export async function readFile(absPath: string): Promise<string> {
  return await fs.readFile(absPath, "utf-8");
}
