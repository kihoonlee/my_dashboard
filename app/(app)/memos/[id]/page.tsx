"use client";

// /memos/[id] — 단일 메모 편집. 제목 + 폰트 크기 토글(보통/작게/크게) + 볼드 마크다운 헬퍼.
// 본문은 markdown으로 저장. 폰트 크기는 UI 상 표시용 (저장은 plain md).

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AgentSidepanel, type Proposal } from "@/components/agent-sidepanel";
import {
  Archive,
  ArchiveRestore,
  Bold,
  Loader2,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Memo = {
  id: string;
  entryDate: string;
  title: string | null;
  bodyMd: string;
  pinned: boolean;
  archived: boolean;
};

type FontSize = "sm" | "base" | "lg";

export default function MemoEditor() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [memo, setMemo] = useState<Memo | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memos/${id}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          router.replace("/memos");
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      const m = (await res.json()) as Memo;
      setMemo(m);
      setTitle(m.title ?? "");
      setBody(m.bodyMd ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/memos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, bodyMd: body }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      const m = (await res.json()) as Memo;
      setMemo(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function patch(update: Partial<Memo>) {
    try {
      const res = await fetch(`/api/memos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`patch ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!confirm("메모를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/memos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      router.push("/memos");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function wrapBold() {
    // textarea의 선택 영역에 **bold** 적용 — 단순 prepend/append로 충분
    setBody((prev) => prev + "\n**굵게** ");
  }

  function applyProposal(p: Proposal) {
    if (p.source !== "memo") return;
    setBody((prev) => (prev ? prev + "\n\n" + p.content : p.content));
  }

  if (loading) {
    return (
      <div className="p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!memo) return null;

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono text-muted-foreground">
            {memo.entryDate}
          </span>
          {memo.pinned && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              고정
            </span>
          )}
          {memo.archived && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              보관됨
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (선택)"
          className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-base font-semibold focus:outline-none focus:border-foreground mb-3"
        />

        {/* 툴바 */}
        <div className="flex items-center gap-1.5 mb-2 text-xs">
          <span className="text-muted-foreground mr-1">폰트:</span>
          {(["sm", "base", "lg"] as const).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => setFontSize(sz)}
              className={cn(
                "rounded-full border px-3 py-1",
                fontSize === sz
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {sz === "sm" ? "작게" : sz === "base" ? "보통" : "크게"}
            </button>
          ))}
          <span className="ml-3 mr-1 text-muted-foreground">서식:</span>
          <button
            type="button"
            onClick={wrapBold}
            className="rounded border border-border px-2 py-0.5 inline-flex items-center gap-1 text-muted-foreground hover:bg-muted"
          >
            <Bold className="h-3 w-3" /> 볼드
          </button>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className={cn(
            "w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono leading-relaxed focus:outline-none focus:border-foreground resize-y",
            fontSize === "sm" && "text-xs",
            fontSize === "base" && "text-sm",
            fontSize === "lg" && "text-base",
          )}
          placeholder="메모 본문 (markdown). 볼드는 **굵게**, 헤더는 # 형식."
        />

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => patch({ pinned: !memo.pinned })}
          >
            {memo.pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
            {memo.pinned ? "고정 해제" : "고정"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => patch({ archived: !memo.archived })}
          >
            {memo.archived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {memo.archived ? "복원" : "보관"}
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" /> 삭제
          </Button>
        </div>
      </main>

      <div className="w-80 shrink-0">
        <AgentSidepanel
          agentEnglishName="memo"
          agentDisplayName="다솜"
          helperText="todo / 일기 / 이전 메모 검색 → 메모에 가져오기"
          pageContext={`[페이지 컨텍스트] 메모 편집 페이지. memo_id=${id}. 현재 본문: """${body.slice(
            0,
            600,
          )}"""`}
          onProposal={applyProposal}
        />
      </div>
    </div>
  );
}
