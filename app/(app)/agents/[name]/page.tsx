"use client";

// /agents/[name] — 단일 agent 상세.
// 탭 4개: 개요 / 프롬프트 / 메타 / 활동.
// 프롬프트 탭에서 편집 + 저장 시 자동 archive + 1클릭 롤백 가능.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agent-badge";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AgentDetail = {
  id: string;
  englishName: string;
  name: string;
  role: string;
  description: string;
  model: string;
  temperature: string | null;
  maxTokens: number;
  topP: string | null;
  systemPrompt: string;
  colorHex: string;
  avatarEmoji: string | null;
  isActive: boolean;
  isPausedReason: string | null;
  triggerConfig: unknown;
  toolPermissions: unknown;
  dailyCostLimitUsd: number | null;
  monthlyCostLimitUsd: number | null;
  createdAt: string;
  updatedAt: string;
};

type Stats = {
  dailyCostUsd: number;
  monthlyCostUsd: number;
  dailyCalls: number;
  last30dCalls: number;
};

type RecentCall = {
  id: string;
  trigger: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: string;
  isError: boolean;
  errorMessage: string | null;
  createdAt: string;
};

type PromptVersion = {
  id: string;
  version: number;
  systemPrompt: string;
  changedBy: string;
  changeNote: string | null;
  createdAt: string;
};

type DetailResponse = {
  agent: AgentDetail;
  stats: Stats;
  recentCalls: RecentCall[];
  promptVersions: PromptVersion[];
};

type Tab = "overview" | "prompt" | "meta" | "activity";

export default function AgentDetailPage() {
  const params = useParams<{ name: string }>();
  const englishName = params?.name as string;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchDetail() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${englishName}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as DetailResponse;
      setData(json);
    } catch (e) {
      setError(`로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (englishName) void fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [englishName]);

  async function patchAgent(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/agents/${englishName}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `status ${res.status}`);
      setInfo(
        json.promptArchived
          ? "저장 완료 — 이전 프롬프트는 버전 히스토리에 archive."
          : "저장 완료.",
      );
      await fetchDetail();
    } catch (e) {
      setError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function rollback(version: number) {
    if (!confirm(`v${version}으로 롤백할까요? 현재 프롬프트는 자동으로 archive됩니다.`)) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/agents/${englishName}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `status ${res.status}`);
      setInfo(`v${version}으로 롤백 완료. 이전 프롬프트는 v${json.archivedAs}에 archive.`);
      await fetchDetail();
    } catch (e) {
      setError(`롤백 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        로딩 중...
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 text-sm text-destructive">{error ?? "에이전트를 찾지 못했습니다."}</div>
    );
  }

  const { agent, stats, recentCalls, promptVersions } = data;

  return (
    <div className="flex flex-col gap-5 p-6 max-w-5xl mx-auto w-full">
      <Link
        href="/agents"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        AI 팀 목록
      </Link>

      <header className="flex items-start gap-3">
        <AgentAvatar
          englishName={agent.englishName}
          size="xl"
          className="ring-2 ring-background shadow-sm"
        />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
            <span className="text-sm text-muted-foreground font-mono">{agent.englishName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{agent.role} · {agent.model}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            patchAgent({
              isActive: !agent.isActive,
              isPausedReason: agent.isActive ? "manual" : null,
            })
          }
          disabled={saving}
          className="gap-2"
        >
          {agent.isActive ? (
            <>
              <PauseCircle className="h-3.5 w-3.5" />
              일시정지
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              활성화
            </>
          )}
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </div>
      )}
      {info && (
        <div className="border border-primary/40 bg-primary/10 text-primary rounded-lg p-3 text-sm">
          {info}
        </div>
      )}

      <nav className="flex gap-1 border-b border-border">
        {(
          [
            ["overview", "개요"],
            ["prompt", "프롬프트"],
            ["meta", "메타"],
            ["activity", "활동"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <OverviewTab agent={agent} stats={stats} recentCalls={recentCalls} />
      )}
      {tab === "prompt" && (
        <PromptTab
          agent={agent}
          promptVersions={promptVersions}
          onSave={patchAgent}
          onRollback={rollback}
          saving={saving}
        />
      )}
      {tab === "meta" && (
        <MetaTab agent={agent} onSave={patchAgent} saving={saving} />
      )}
      {tab === "activity" && <ActivityTab calls={recentCalls} />}
    </div>
  );
}

function OverviewTab({
  agent,
  stats,
  recentCalls,
}: {
  agent: AgentDetail;
  stats: Stats;
  recentCalls: RecentCall[];
}) {
  const dailyPct =
    agent.dailyCostLimitUsd && agent.dailyCostLimitUsd > 0
      ? Math.min(100, (stats.dailyCostUsd / agent.dailyCostLimitUsd) * 100)
      : 0;
  const monthlyPct =
    agent.monthlyCostLimitUsd && agent.monthlyCostLimitUsd > 0
      ? Math.min(100, (stats.monthlyCostUsd / agent.monthlyCostLimitUsd) * 100)
      : 0;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {agent.description}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="오늘 호출" value={String(stats.dailyCalls)} />
        <Stat label="30일 호출" value={String(stats.last30dCalls)} />
        <Stat
          label="오늘 비용"
          value={`$${stats.dailyCostUsd.toFixed(4)}`}
          sub={agent.dailyCostLimitUsd ? `${dailyPct.toFixed(0)}% / $${agent.dailyCostLimitUsd}` : undefined}
        />
        <Stat
          label="이번달"
          value={`$${stats.monthlyCostUsd.toFixed(4)}`}
          sub={agent.monthlyCostLimitUsd ? `${monthlyPct.toFixed(0)}% / $${agent.monthlyCostLimitUsd}` : undefined}
        />
      </div>
      <h3 className="text-sm font-medium mt-2">최근 호출 (최대 5건)</h3>
      <div className="text-xs">
        {recentCalls.length === 0 ? (
          <div className="text-muted-foreground">호출 기록이 없습니다.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
            {recentCalls.slice(0, 5).map((c) => (
              <li key={c.id} className="px-3 py-2 flex items-center gap-3">
                <span className="font-mono text-muted-foreground shrink-0 w-32">
                  {new Date(c.createdAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-mono shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {c.trigger}
                </span>
                <span className="font-mono text-muted-foreground/80 shrink-0">
                  {c.inputTokens}/{c.outputTokens}
                </span>
                <span className="font-mono text-muted-foreground shrink-0">
                  ${parseFloat(c.costUsd).toFixed(6)}
                </span>
                {c.isError && (
                  <span className="text-destructive truncate">⚠ {c.errorMessage}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">{sub}</div>}
    </div>
  );
}

function PromptTab({
  agent,
  promptVersions,
  onSave,
  onRollback,
  saving,
}: {
  agent: AgentDetail;
  promptVersions: PromptVersion[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onRollback: (v: number) => Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(agent.systemPrompt);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setDraft(agent.systemPrompt);
  }, [agent.systemPrompt]);

  const dirty = draft !== agent.systemPrompt;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">현재 프롬프트</h3>
        <span className="text-[11px] text-muted-foreground font-mono">
          {draft.length} chars
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full min-h-[280px] rounded-lg border border-border bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="변경 메모 (선택)"
          disabled={!dirty || saving}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <Button
          onClick={async () => {
            await onSave({ systemPrompt: draft, changeNote: note || undefined });
            setNote("");
          }}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(agent.systemPrompt);
              setNote("");
            }}
          >
            취소
          </Button>
        )}
      </div>

      <h3 className="text-sm font-medium mt-4">버전 히스토리</h3>
      {promptVersions.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">
          저장된 이전 버전이 없습니다. 프롬프트를 수정해 저장하면 자동으로 archive됩니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {promptVersions.map((v) => (
            <li
              key={v.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <header className="flex items-center gap-3 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  v{v.version}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(v.createdAt).toLocaleString("ko-KR")}
                </span>
                <span className="text-xs flex-1 min-w-0 truncate">
                  {v.changeNote ?? <span className="text-muted-foreground/60">(메모 없음)</span>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setExpanded((cur) => (cur === v.id ? null : v.id))
                  }
                >
                  {expanded === v.id ? "접기" : "보기"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRollback(v.version)}
                  disabled={saving}
                  className="gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  롤백
                </Button>
              </header>
              {expanded === v.id && (
                <pre className="px-3 py-3 text-xs font-mono leading-relaxed whitespace-pre-wrap border-t border-border bg-muted/30 max-h-80 overflow-y-auto">
                  {v.systemPrompt}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetaTab({
  agent,
  onSave,
  saving,
}: {
  agent: AgentDetail;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [model, setModel] = useState(agent.model);
  const [temperature, setTemperature] = useState(
    agent.temperature ?? "",
  );
  const [maxTokens, setMaxTokens] = useState(String(agent.maxTokens));
  const [dailyLimit, setDailyLimit] = useState(
    agent.dailyCostLimitUsd?.toString() ?? "",
  );
  const [monthlyLimit, setMonthlyLimit] = useState(
    agent.monthlyCostLimitUsd?.toString() ?? "",
  );
  const [description, setDescription] = useState(agent.description);

  useEffect(() => {
    setModel(agent.model);
    setTemperature(agent.temperature ?? "");
    setMaxTokens(String(agent.maxTokens));
    setDailyLimit(agent.dailyCostLimitUsd?.toString() ?? "");
    setMonthlyLimit(agent.monthlyCostLimitUsd?.toString() ?? "");
    setDescription(agent.description);
  }, [agent]);

  const dirty =
    model !== agent.model ||
    temperature !== (agent.temperature ?? "") ||
    maxTokens !== String(agent.maxTokens) ||
    dailyLimit !== (agent.dailyCostLimitUsd?.toString() ?? "") ||
    monthlyLimit !== (agent.monthlyCostLimitUsd?.toString() ?? "") ||
    description !== agent.description;

  async function save() {
    const patch: Record<string, unknown> = {};
    if (model !== agent.model) patch.model = model;
    if (temperature !== (agent.temperature ?? "")) {
      patch.temperature = temperature === "" ? null : temperature;
    }
    if (maxTokens !== String(agent.maxTokens)) {
      const n = parseInt(maxTokens, 10);
      if (!Number.isFinite(n) || n <= 0) return;
      patch.maxTokens = n;
    }
    if (dailyLimit !== (agent.dailyCostLimitUsd?.toString() ?? "")) {
      patch.dailyCostLimitUsd = dailyLimit === "" ? null : dailyLimit;
    }
    if (monthlyLimit !== (agent.monthlyCostLimitUsd?.toString() ?? "")) {
      patch.monthlyCostLimitUsd = monthlyLimit === "" ? null : monthlyLimit;
    }
    if (description !== agent.description) patch.description = description;
    await onSave(patch);
  }

  return (
    <section className="flex flex-col gap-4">
      <Field label="모델">
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Temperature (0~1)">
          <input
            type="text"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="0.5"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Max Tokens">
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            min={1}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="일 비용 한도 ($)">
          <input
            type="text"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="1.50"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="월 비용 한도 ($)">
          <input
            type="text"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            placeholder="45.00"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
        </Field>
      </div>

      <Field label="설명">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </Field>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <div className="font-medium mb-1.5">트리거</div>
        <pre className="font-mono text-muted-foreground whitespace-pre-wrap break-words">
          {JSON.stringify(agent.triggerConfig, null, 2)}
        </pre>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <div className="font-medium mb-1.5">도구 권한</div>
        <pre className="font-mono text-muted-foreground whitespace-pre-wrap break-words">
          {JSON.stringify(agent.toolPermissions, null, 2)}
        </pre>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
        </Button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActivityTab({ calls }: { calls: RecentCall[] }) {
  if (calls.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
        호출 기록이 없습니다.
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden text-xs">
      {calls.map((c) => (
        <li
          key={c.id}
          className={cn(
            "px-3 py-2 flex items-center gap-3 hover:bg-muted/30 transition-colors",
            c.isError && "bg-destructive/5",
          )}
        >
          <span className="font-mono text-muted-foreground shrink-0 w-32">
            {new Date(c.createdAt).toLocaleString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="font-mono shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {c.trigger}
          </span>
          <span className="font-mono text-muted-foreground/80 shrink-0">
            {c.inputTokens}/{c.outputTokens}
          </span>
          <span className="font-mono shrink-0">
            ${parseFloat(c.costUsd).toFixed(6)}
          </span>
          <span className="font-mono text-muted-foreground/60 shrink-0">
            {c.durationMs}ms
          </span>
          {c.isError && c.errorMessage && (
            <span className="text-destructive truncate flex-1">
              ⚠ {c.errorMessage}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
