// ~/.claude/skills/<name>/SKILL.md 파일 스캐너.
// 각 skill은 디렉토리 + SKILL.md 구조. 심볼릭 링크는 따라간다 (external-skills repo로 링크된 경우).

import "server-only";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";

export type ScannedSkill = {
  name: string; // 디렉토리 이름 = skill name
  filePath: string; // SKILL.md 절대 경로
  description: string | null;
  category: string | null;
  version: string | null;
  tags: string[];
  rawFrontmatter: Record<string, unknown>;
  isSymlink: boolean;
  lastModified: Date;
};

export type ScanResult = {
  skills: ScannedSkill[];
  errors: Array<{ name: string; message: string }>;
};

/**
 * 지정 디렉토리(`~/.claude/skills/`)를 1뎁스 스캔. 각 하위 항목이:
 *   - 디렉토리 + SKILL.md 존재 → skill로 등록
 *   - 심볼릭 링크 → readlink/stat로 실제 파일 추적
 *   - 그 외 (파일, .DS_Store 등) → skip
 */
export async function scanSkillsDirectory(
  rootPath: string,
): Promise<ScanResult> {
  const skills: ScannedSkill[] = [];
  const errors: Array<{ name: string; message: string }> = [];

  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch (e) {
    return {
      skills: [],
      errors: [
        {
          name: rootPath,
          message: `readdir failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // .DS_Store 등 무시

    const entryPath = join(rootPath, entry.name);

    // 심볼릭 링크면 진짜 디렉토리인지 확인 (lstat은 심볼릭 자체, stat은 타깃 추적)
    let isDir = entry.isDirectory();
    let isSymlink = entry.isSymbolicLink();
    if (isSymlink) {
      try {
        const targetStat = await stat(entryPath);
        isDir = targetStat.isDirectory();
      } catch {
        // 깨진 링크는 skip
        continue;
      }
    }
    if (!isDir) continue;

    const skillFilePath = join(entryPath, "SKILL.md");
    let fileContent;
    let fileStat;
    try {
      fileContent = await readFile(skillFilePath, "utf-8");
      fileStat = await stat(skillFilePath);
    } catch {
      // SKILL.md 없으면 skill 아님 → skip (디렉토리는 다른 용도일 수 있음)
      continue;
    }

    try {
      const parsed = matter(fileContent);
      const fm = parsed.data as Record<string, unknown>;
      skills.push({
        name: entry.name,
        filePath: skillFilePath,
        description:
          typeof fm.description === "string" ? fm.description.trim() : null,
        category: pickCategory(fm),
        version: typeof fm.version === "string" ? fm.version : null,
        tags: extractTags(fm),
        rawFrontmatter: fm,
        isSymlink,
        lastModified: fileStat.mtime,
      });
    } catch (e) {
      errors.push({
        name: entry.name,
        message: `frontmatter parse failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return { skills, errors };
}

/**
 * frontmatter에 `category`/`type`/`tier` 등 다양한 필드가 올 수 있어 우선순위로 추출.
 */
function pickCategory(fm: Record<string, unknown>): string | null {
  const candidates = ["category", "type", "preamble-tier"];
  for (const key of candidates) {
    const v = fm[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * tags / keywords / aliases 등을 합쳐서 string 배열.
 */
function extractTags(fm: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const keys = ["tags", "keywords", "aliases", "voice-triggers"];
  for (const key of keys) {
    const v = fm[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim().length > 0) {
          out.add(item.trim());
        }
      }
    }
  }
  // benefits-from / allowed-tools 등도 부가 태그로
  const af = fm["benefits-from"];
  if (Array.isArray(af)) {
    for (const item of af) {
      if (typeof item === "string") out.add(`needs:${item.trim()}`);
    }
  }
  return Array.from(out);
}
