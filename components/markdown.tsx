// 의존성 없는 mini-markdown 렌더러.
// LLM 응답(혜원 종합 브리핑, 민영 인트로 등)에서 일관되게 쓰이는 markdown 요소만 지원.
//
// 지원: # ## ### 헤더, **bold**, *italic*, `code`, [link](url),
//       - / * 불릿 리스트, 1. 번호 리스트, > 인용, ``` 코드블록, --- 구분선.
// 미지원: 이미지, 표, footnote, HTML inline. (필요 시 react-markdown으로 교체)
//
// 안전성: HTML 직접 dangerouslySetInnerHTML 안 씀 — React 노드 트리로 빌드.

import React from "react";
import { cn } from "@/lib/utils";

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; text: string; lang: string | null }
  | { kind: "hr" }
  | { kind: "p"; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 코드블록 ``` ... ```
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim() || null;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // closing ```
      blocks.push({ kind: "code", text: buf.join("\n"), lang });
      continue;
    }

    // 빈 줄
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // 구분선
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // 헤더
    const h = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (h) {
      blocks.push({
        kind: "h",
        level: h[1].length as 1 | 2 | 3,
        text: h[2],
      });
      i += 1;
      continue;
    }

    // 인용
    if (/^>\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "blockquote", text: buf.join(" ") });
      continue;
    }

    // 불릿 리스트 (- 또는 *)
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // 번호 리스트 (1. 2. ...)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // 일반 단락 — 빈 줄 또는 블록 시작 전까지 모음
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,3}\s|>\s|\s*[-*]\s|\s*\d+\.\s|```|---|\*\*\*|___)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }

  return blocks;
}

/** inline 토큰 → React 노드 배열. **bold** *italic* `code` [text](url) 처리. */
function renderInline(text: string): React.ReactNode[] {
  // 토크나이저: 정규식 그룹으로 한꺼번에 잡고 순서대로 처리.
  // 우선순위: code > link > bold > italic.
  const tokens: Array<{ type: string; raw: string; a?: string; b?: string }> = [];
  let rest = text;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const m = rest.match(
      /(`[^`]+`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/,
    );
    if (!m) {
      if (rest) tokens.push({ type: "text", raw: rest });
      break;
    }
    const idx = m.index ?? 0;
    if (idx > 0) tokens.push({ type: "text", raw: rest.slice(0, idx) });
    if (m[1]) {
      tokens.push({ type: "code", raw: m[1].slice(1, -1) });
    } else if (m[2]) {
      tokens.push({ type: "link", raw: m[3], a: m[4] });
    } else if (m[5]) {
      tokens.push({ type: "bold", raw: m[5].slice(2, -2) });
    } else if (m[6]) {
      tokens.push({ type: "italic", raw: m[6].slice(1, -1) });
    }
    rest = rest.slice(idx + m[0].length);
  }

  return tokens.map((t, i) => {
    switch (t.type) {
      case "code":
        return (
          <code
            key={i}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
          >
            {t.raw}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={t.a}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {t.raw}
          </a>
        );
      case "bold":
        return (
          <strong key={i} className="font-semibold text-foreground">
            {t.raw}
          </strong>
        );
      case "italic":
        return (
          <em key={i} className="italic">
            {t.raw}
          </em>
        );
      default:
        return <React.Fragment key={i}>{t.raw}</React.Fragment>;
    }
  });
}

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const blocks = parseBlocks(children);
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h": {
            const cls =
              b.level === 1
                ? "text-base font-semibold tracking-tight"
                : b.level === 2
                  ? "text-sm font-semibold tracking-tight"
                  : "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
            const Tag = b.level === 1 ? "h2" : b.level === 2 ? "h3" : "h4";
            return (
              <Tag key={i} className={cls}>
                {renderInline(b.text)}
              </Tag>
            );
          }
          case "p":
            return (
              <p key={i} className="text-foreground/90">
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="flex flex-col gap-1.5 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70"
                    />
                    <span className="flex-1 text-foreground/90">
                      {renderInline(it)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="flex flex-col gap-1.5 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0 mt-0.5 w-4 text-right">
                      {j + 1}.
                    </span>
                    <span className="flex-1 text-foreground/90">
                      {renderInline(it)}
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "blockquote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-primary/40 pl-3 py-0.5 text-muted-foreground italic"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto"
              >
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-border" />;
        }
      })}
    </div>
  );
}
