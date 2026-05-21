"use client";

// /diary — 날짜 선택 일기 작성 + 이미지 업로드 + 달이 사이드패널.
// 좌측 날짜 picker + 최근 7개 일기 리스트, 우측 본문 에디터 + 사이드패널.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentSidepanel, type Proposal } from "@/components/agent-sidepanel";
import { Loader2, Trash2, Upload } from "lucide-react";

type Entry = {
  id: string;
  entryDate: string;
  title: string | null;
  bodyMd: string;
  mood: string | null;
};

type Image = {
  id: string;
  storagePath: string;
  caption: string | null;
  sortOrder: number;
};

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function DiaryPage() {
  const [date, setDate] = useState<string>(todayKst());
  const [, setEntry] = useState<Entry | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/diary/${d}`, { cache: "no-store" });
      const data = (await res.json()) as { entry: Entry | null; images: Image[] };
      setEntry(data.entry);
      setTitle(data.entry?.title ?? "");
      setBody(data.entry?.bodyMd ?? "");
      setMood(data.entry?.mood ?? "");
      setImages(data.images ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  useEffect(() => {
    fetch("/api/diary?from=" + addDays(date, -30), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const items = (data.items ?? []) as Array<{ entryDate: string }>;
        setRecentDates(items.map((i) => i.entryDate));
      })
      .catch(() => {});
  }, [date]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: date,
          title: title || null,
          bodyMd: body,
          mood: mood || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `status ${res.status}`);
      }
      await load(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const signRes = await fetch("/api/storage/diary-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      if (!signRes.ok) {
        const data = (await signRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `signed url ${signRes.status}`);
      }
      const { signedUrl, storagePath } = (await signRes.json()) as {
        signedUrl: string;
        storagePath: string;
      };

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) {
        throw new Error(`upload ${uploadRes.status}`);
      }

      const linkRes = await fetch(`/api/diary/${date}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath }),
      });
      if (!linkRes.ok) {
        const data = (await linkRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `link ${linkRes.status}`);
      }
      await load(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(id: string) {
    if (!confirm("이미지를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/diary/${date}/images?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      await load(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function applyProposal(p: Proposal) {
    if (p.source !== "diary") return;
    setBody((prev) => (prev ? prev + "\n\n" + p.content : p.content));
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      {/* 좌측: 날짜 picker + 최근 리스트 */}
      <aside className="w-56 border-r border-border bg-sidebar p-4 flex flex-col gap-3 shrink-0">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            날짜
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            최근 일기
          </div>
          <ul className="flex flex-col gap-0.5">
            {recentDates.length === 0 ? (
              <li className="text-xs text-muted-foreground/70">없음</li>
            ) : (
              recentDates.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => setDate(d)}
                    className={
                      d === date
                        ? "w-full text-left rounded-md px-2 py-1 text-xs bg-primary/10 text-foreground font-medium"
                        : "w-full text-left rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    }
                  >
                    {d}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </aside>

      {/* 가운데: 본문 에디터 */}
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold tracking-tight mb-4">
          일기 · {date}
        </h1>

        {error && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="기분 한 줄 (선택)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="오늘 일기를 적어주세요…"
              rows={16}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
            />

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "저장"
                )}
              </Button>
              <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>이미지 업로드</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                  }}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploading && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> 업로드 중…
                </span>
              )}
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative rounded-lg border border-border overflow-hidden aspect-square bg-muted"
                  >
                    <div className="text-[10px] font-mono p-2 text-muted-foreground break-all">
                      {img.storagePath}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/80 backdrop-blur text-destructive hover:bg-background"
                      aria-label="이미지 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 우측: 달이 사이드패널 */}
      <div className="w-80 shrink-0">
        <AgentSidepanel
          agentEnglishName="diary"
          agentDisplayName="달이"
          helperText="이전 일기·메모 검색 및 인용 제안"
          pageContext={`[페이지 컨텍스트] 현재 일기 작성 날짜: ${date}. 현재 본문 길이: ${body.length}자.`}
          onProposal={applyProposal}
        />
      </div>
    </div>
  );
}

function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd + n));
  return dt.toISOString().slice(0, 10);
}
