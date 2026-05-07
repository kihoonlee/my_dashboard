// 의존성 없는 RSS 2.0 / Atom 1.0 미니 파서.
// 외부 RSS 라이브러리 추가 안 함 — 표준 포맷은 regex로 충분히 안정적.
// 더 엣지케이스(예: 비표준 namespace) 만나면 fast-xml-parser 추가 검토.

import "server-only";

export type ParsedItem = {
  title: string;
  url: string;
  description: string | null;
  publishedAt: Date | null;
  guid: string | null;
};

export type ParsedFeed = {
  title: string | null;
  items: ParsedItem[];
};

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "MyHub/1.0 (+https://github.com/kihoonlee/my_dashboard)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`RSS fetch failed (${res.status}): ${url}`);
  }
  const xml = await res.text();
  return parseFeed(xml);
}

export function parseFeed(xml: string): ParsedFeed {
  // Atom: <entry>, RSS: <item>
  const isAtom = /<feed[\s>]/i.test(xml);
  const channelTitleRaw = extractFirst(xml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanText(channelTitleRaw) ?? null;

  if (isAtom) {
    const entries = matchAll(xml, /<entry[\s\S]*?<\/entry>/gi);
    return {
      title,
      items: entries.map((e) => parseAtomEntry(e)),
    };
  }

  const items = matchAll(xml, /<item[\s\S]*?<\/item>/gi);
  return {
    title,
    items: items.map((it) => parseRssItem(it)),
  };
}

// ─────────────────────────────────────────────────────────

function parseRssItem(block: string): ParsedItem {
  const title = cleanText(extractFirst(block, /<title[^>]*>([\s\S]*?)<\/title>/i)) ?? "";
  const link = cleanText(extractFirst(block, /<link[^>]*>([\s\S]*?)<\/link>/i)) ?? "";
  const desc = cleanText(extractFirst(block, /<description[^>]*>([\s\S]*?)<\/description>/i));
  const pub = extractFirst(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
  const guid = cleanText(extractFirst(block, /<guid[^>]*>([\s\S]*?)<\/guid>/i));
  return {
    title,
    url: link,
    description: desc ?? null,
    publishedAt: pub ? safeDate(pub) : null,
    guid: guid ?? null,
  };
}

function parseAtomEntry(block: string): ParsedItem {
  const title = cleanText(extractFirst(block, /<title[^>]*>([\s\S]*?)<\/title>/i)) ?? "";
  // <link href="..."/> or <link>...</link>
  const linkHref = extractFirst(block, /<link[^>]*\bhref\s*=\s*"([^"]+)"/i);
  const linkInner = cleanText(
    extractFirst(block, /<link[^>]*>([\s\S]*?)<\/link>/i),
  );
  const summary =
    cleanText(
      extractFirst(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) ??
        extractFirst(block, /<content[^>]*>([\s\S]*?)<\/content>/i),
    ) ?? null;
  const updated =
    extractFirst(block, /<published[^>]*>([\s\S]*?)<\/published>/i) ??
    extractFirst(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i);
  const guid = cleanText(extractFirst(block, /<id[^>]*>([\s\S]*?)<\/id>/i));
  return {
    title,
    url: linkHref ?? linkInner ?? "",
    description: summary,
    publishedAt: updated ? safeDate(updated) : null,
    guid: guid ?? null,
  };
}

function extractFirst(s: string, re: RegExp): string | undefined {
  const m = s.match(re);
  return m ? m[1] : undefined;
}

function matchAll(s: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

/**
 * CDATA 제거, HTML 태그 제거, entity 디코딩, 공백 정리.
 */
function cleanText(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  let t = s;
  t = t.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1");
  t = t.replace(/<\/?[^>]+>/g, "");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function safeDate(s: string): Date | null {
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}
