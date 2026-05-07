// Obsidian 마크다운 노트 파서.
// 입력: raw 텍스트 + 파일 path
// 출력: frontmatter title/tags/wikilinks/word count + raw content
//
// frontmatter 파싱: gray-matter
// 인라인 태그: 본문에서 `#태그` (영어/한글/숫자/-/_ 허용) 추출
// 위키링크: [[Page]], [[Page|Alias]], [[Page#Section]] 추출 (참조 스토리지는 추후 — 일단 메타로만)

import matter from "gray-matter";
import { basename } from "path";

export type ParsedNote = {
  title: string;
  content: string;
  tags: string[];
  wikilinks: string[];
  wordCount: number;
};

const INLINE_TAG_RE = /(?<![\w\/])#([\p{L}\p{N}_/-]+)/gu;
const WIKILINK_RE = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;

export function parseNote(rawText: string, filePath: string): ParsedNote {
  const { data, content } = matter(rawText);

  // Title 결정: frontmatter.title > 첫 H1 > 파일명
  const fmTitle = typeof data.title === "string" ? data.title.trim() : "";
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fileTitle = basename(filePath).replace(/\.md$/i, "");
  const title = fmTitle || h1 || fileTitle;

  // Tags: frontmatter(.tags 배열 또는 문자열) + 인라인
  const fmTags = normalizeTags(data.tags);
  const inlineTags = Array.from(content.matchAll(INLINE_TAG_RE), (m) => m[1]);
  const tags = Array.from(new Set([...fmTags, ...inlineTags]));

  // Wikilinks
  const wikilinks = Array.from(
    content.matchAll(WIKILINK_RE),
    (m) => m[1].trim(),
  ).filter((s) => s.length > 0);

  // word count: 한국어는 어절(공백 구분)이 영어 단어와 비슷한 단위
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return {
    title,
    content,
    tags,
    wikilinks: Array.from(new Set(wikilinks)),
    wordCount,
  };
}

function normalizeTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean);
  }
  return [];
}
