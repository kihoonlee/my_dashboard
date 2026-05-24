"use client";

// /settings — 사용자 설정.
// 프로필(이름) / 외부 연동 상태 / 마지막 동기화 + 수동 트리거 / 환경 정보 / 테마.
//
// 동기화 메타는 /api/settings에서 settings_json을 가공해서 받음.
// 수동 sync 버튼은 기존 /api/sync/* 라우트를 그대로 호출 후 데이터 다시 fetch.

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Key,
  Loader2,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Sun,
  Moon,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type SyncMeta = {
  at?: string;
  count?: number;
  upserts?: number;
  deletedStale?: number;
  calendarsSynced?: number;
  errors?: string[];
};

type OauthTokenInfo = {
  provider: string;
  scope: string;
  expiresAt: string | null;
  lastRefreshedAt: string | null;
  updatedAt: string | null;
};

type ApiKeyState =
  | { source: "db"; maskedTail: string; verifiedAt: string | null }
  | { source: "env" }
  | { source: "none" };

type ApiKeyProvider = "anthropic" | "openai" | "github" | "gemini";
// UI에 노출하는 provider — DB에 등록된 github 키는 보존하되 v2 UI에선 안 보임.
const VISIBLE_API_KEY_PROVIDERS: ApiKeyProvider[] = [
  "anthropic",
  "gemini",
  "openai",
];

type SettingsResponse = {
  profile: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  integrations: {
    apiKeys: Record<ApiKeyProvider, ApiKeyState>;
    allowedEmail: string | null;
    oauthTokens: OauthTokenInfo[];
  };
  sync: {
    calendar: SyncMeta | null;
  };
  todayInsight: { date: string | null; oneLiner: string | null } | null;
};

type SyncKind = "calendar";

const SYNC_LABEL: Record<SyncKind, string> = {
  calendar: "캘린더",
};

const SYNC_ICON: Record<SyncKind, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeSync(meta: SyncMeta | null): string {
  if (!meta) return "한 번도 동기화하지 않음";
  const c = meta.count ?? meta.upserts ?? 0;
  const stale = meta.deletedStale ?? 0;
  const cals = meta.calendarsSynced ?? 0;
  const calsLabel = cals > 0 ? ` · 캘린더 ${cals}개` : "";
  return `${c}건 캐시 · 만료 정리 ${stale}${calsLabel}`;
}

const SYNC_ENDPOINT: Record<SyncKind, string> = {
  calendar: "/api/sync/calendar",
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [syncingKind, setSyncingKind] = useState<SyncKind | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const json: SettingsResponse = await res.json();
      setData(json);
      setName(json.profile.name ?? "");
    } catch (e) {
      setError(`설정 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `status ${res.status}`);
      }
      setInfo("저장되었습니다");
      setTimeout(() => setInfo(null), 3000);
      await fetchData();
    } catch (e) {
      setError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function triggerSync(kind: SyncKind) {
    if (syncingKind) return;
    setSyncingKind(kind);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(SYNC_ENDPOINT[kind], { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.message ?? body?.error ?? `status ${res.status}`;
        throw new Error(typeof msg === "string" ? msg : "unknown");
      }
      setInfo(`${SYNC_LABEL[kind]} 동기화 완료`);
      setTimeout(() => setInfo(null), 3000);
      await fetchData();
    } catch (e) {
      setError(
        `${SYNC_LABEL[kind]} 동기화 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSyncingKind(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        설정 불러오는 중…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error ?? "설정을 불러올 수 없습니다"}
        </div>
      </div>
    );
  }

  const googleToken = data.integrations.oauthTokens.find(
    (t) => t.provider === "google",
  );

  return (
    <div className="flex flex-col gap-8 p-6 max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-foreground text-background flex items-center justify-center">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">설정</h1>
          <p className="text-sm text-muted-foreground">
            프로필 · 외부 연동 · 동기화 · 환경
          </p>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3 text-sm flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {info && (
        <div className="text-xs text-foreground bg-[var(--pastel-mint)] border border-transparent rounded-full px-3.5 py-1.5 inline-flex items-center gap-2 self-start">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {info}
        </div>
      )}

      {/* 프로필 */}
      <Section title="프로필" icon={User}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이메일" value={data.profile.email} mono />
          <Field
            label="가입일"
            value={new Date(data.profile.createdAt).toLocaleDateString("ko-KR")}
          />
        </div>
        <div className="grid gap-3 mt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              표시 이름
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="민지가 부를 이름"
              className="rounded-2xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:border-foreground"
            />
          </label>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              저장
            </Button>
          </div>
        </div>
      </Section>

      {/* 동기화 */}
      <Section title="동기화" icon={RefreshCw}>
        <ul className="flex flex-col divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {(Object.keys(SYNC_LABEL) as SyncKind[]).map((kind) => {
            const meta = data.sync[kind];
            const Icon = SYNC_ICON[kind];
            const isSyncing = syncingKind === kind;
            return (
              <li
                key={kind}
                className="flex items-start gap-3 px-4 py-3 bg-card"
              >
                <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{SYNC_LABEL[kind]}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    마지막 {formatDateTime(meta?.at ?? null)} · {describeSync(meta)}
                  </div>
                  {meta?.errors && meta.errors.length > 0 && (
                    <div className="text-[11px] text-destructive mt-1 font-mono line-clamp-2">
                      {meta.errors.length}건 오류: {meta.errors[0]}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerSync(kind)}
                  disabled={!!syncingKind}
                  className="gap-1.5 shrink-0"
                >
                  {isSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  지금 실행
                </Button>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* API 키 — 입력·검증·저장 */}
      <Section title="API 키" icon={Key}>
        <p className="text-xs text-muted-foreground -mt-1">
          입력 → 실제 API에 검증 호출 → 통과 시 암호화 저장 (pgcrypto). DB 키가 우선이고
          삭제하면 .env.local 값으로 fallback.
        </p>
        <div className="flex flex-col gap-3">
          {VISIBLE_API_KEY_PROVIDERS.map((provider) => (
            <ApiKeyCard
              key={provider}
              provider={provider}
              state={data.integrations.apiKeys[provider]}
              onChanged={fetchData}
            />
          ))}
        </div>
      </Section>

      {/* 기타 연동 */}
      <Section title="기타 연동" icon={Key}>
        <div className="grid gap-2">
          <IntegrationRow
            label="Google OAuth (Calendar/Gmail)"
            ok={!!googleToken}
            detail={
              googleToken
                ? `scope: ${googleToken.scope || "(없음)"} · 갱신 ${formatDateTime(googleToken.lastRefreshedAt)}`
                : "연결 안 됨 — /auth/login 으로 다시 로그인하면 refresh token이 저장됩니다"
            }
          />
          <IntegrationRow
            label="허용 이메일 (ALLOWED_EMAIL)"
            ok={!!data.integrations.allowedEmail}
            detail={data.integrations.allowedEmail ?? "미설정"}
            mono
          />
        </div>
      </Section>

      {/* 데일리 인사이트 */}
      {data.todayInsight && (
        <Section title="오늘의 한 마디 (캐시)" icon={CheckCircle2}>
          <div className="border border-border rounded-2xl bg-card p-3.5">
            <div className="text-[11px] text-muted-foreground font-mono mb-1">
              {data.todayInsight.date ?? "—"}
            </div>
            <div className="text-sm">
              {data.todayInsight.oneLiner ?? "(생성된 한 마디 없음)"}
            </div>
          </div>
        </Section>
      )}

      {/* 테마 */}
      <Section title="외관" icon={theme === "dark" ? Moon : Sun}>
        <div className="flex items-center gap-3">
          <span className="text-sm">현재 테마: {theme === "dark" ? "다크" : "라이트"}</span>
          <div className="flex gap-1.5">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
              className="gap-1.5"
            >
              <Sun className="h-3.5 w-3.5" /> 라이트
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
              className="gap-1.5"
            >
              <Moon className="h-3.5 w-3.5" /> 다크
            </Button>
          </div>
        </div>
      </Section>

      <footer className="text-xs text-muted-foreground border-t border-border pt-4">
        Phase 7 — 단일 사용자 화이트리스트 모드. 환경변수는 `.env.local`에서 직접 수정 후 dev 서버 재시작.
      </footer>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-sm", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function IntegrationRow({
  label,
  ok,
  detail,
  mono,
}: {
  label: string;
  ok: boolean;
  detail: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border border-border rounded-2xl bg-card px-3.5 py-3">
      <span
        className={cn(
          "mt-0.5 size-2 rounded-full shrink-0",
          ok ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
        aria-label={ok ? "연결됨" : "미연결"}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div
          className={cn(
            "text-[11px] text-muted-foreground mt-0.5 break-words",
            mono && "font-mono",
          )}
        >
          {detail}
        </div>
      </div>
      <span
        className={cn(
          "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
          ok
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
            : "bg-muted text-muted-foreground border border-border",
        )}
      >
        {ok ? "연결됨" : "미연결"}
      </span>
    </div>
  );
}

const PROVIDER_META: Record<
  ApiKeyProvider,
  { label: string; placeholder: string; doc: string }
> = {
  anthropic: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    doc: "혜원·민지 (orchestrator, Sonnet 4.6) 호출에 사용",
  },
  gemini: {
    label: "Google Gemini API Key",
    placeholder: "AIza...",
    doc: "수민·현주·하영·서연·도연·다솜·민영·정연 (Gemini 3.1) 호출",
  },
  openai: {
    label: "OpenAI API Key",
    placeholder: "sk-proj-...",
    doc: "옵시디언 의미 검색 임베딩 (text-embedding-3-small)",
  },
  github: {
    label: "GitHub PAT",
    placeholder: "ghp_... 또는 github_pat_...",
    doc: "GitHub 활동 동기화 (FlowTo-ai 조직 repo)",
  },
};

function ApiKeyCard({
  provider,
  state,
  onChanged,
}: {
  provider: ApiKeyProvider;
  state: ApiKeyState;
  onChanged: () => void | Promise<void>;
}) {
  const meta = PROVIDER_META[provider];
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);

  async function save() {
    if (!value.trim() || busy) return;
    setBusy("save");
    setLocalError(null);
    setLocalInfo(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: value.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `status ${res.status}`);
      }
      setValue("");
      setLocalInfo(
        body?.detail ? `검증 완료 — ${body.detail}` : "검증 완료 — 저장됨",
      );
      setTimeout(() => setLocalInfo(null), 4000);
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    if (
      !confirm(
        `${meta.label}을(를) DB에서 삭제하시겠습니까?\n.env.local에 값이 있으면 그쪽으로 fallback합니다.`,
      )
    )
      return;
    setBusy("delete");
    setLocalError(null);
    setLocalInfo(null);
    try {
      const res = await fetch(
        `/api/settings/api-keys?provider=${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message ?? body?.error ?? `status ${res.status}`);
      }
      setLocalInfo("삭제됨");
      setTimeout(() => setLocalInfo(null), 3000);
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const badge =
    state.source === "db"
      ? {
          text: "검증됨 (DB)",
          cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
        }
      : state.source === "env"
        ? {
            text: ".env fallback",
            cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
          }
        : {
            text: "미설정",
            cls: "bg-muted text-muted-foreground border-border",
          };

  return (
    <div className="border border-border rounded-2xl bg-card p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{meta.label}</span>
        <span
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full border",
            badge.cls,
          )}
        >
          {badge.text}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {meta.doc}
        </span>
      </div>

      {state.source === "db" && (
        <div className="text-[11px] text-muted-foreground font-mono">
          ••••••••{state.maskedTail} · 마지막 검증{" "}
          {state.verifiedAt
            ? new Date(state.verifiedAt).toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </div>
      )}
      {state.source === "env" && (
        <div className="text-[11px] text-muted-foreground">
          .env.local 값을 사용 중입니다. 새 키를 입력하면 DB로 옮겨집니다.
        </div>
      )}
      {state.source === "none" && (
        <div className="text-[11px] text-muted-foreground">
          설정되지 않음 — 키를 입력해주세요.
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={meta.placeholder}
          disabled={busy !== null}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm font-mono focus:outline-none focus:border-foreground"
        />
        <Button
          size="sm"
          onClick={save}
          disabled={!value.trim() || busy !== null}
          className="gap-1.5 shrink-0"
        >
          {busy === "save" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          검증하고 저장
        </Button>
        {state.source === "db" && (
          <Button
            size="sm"
            variant="outline"
            onClick={remove}
            disabled={busy !== null}
            className="shrink-0"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "삭제"
            )}
          </Button>
        )}
      </div>

      {localError && (
        <div className="text-[11px] text-destructive bg-destructive/5 border border-destructive/30 rounded-xl px-2.5 py-1.5">
          {localError}
        </div>
      )}
      {localInfo && (
        <div className="text-[11px] text-foreground bg-[var(--pastel-mint)] border border-transparent rounded-xl px-2.5 py-1.5">
          {localInfo}
        </div>
      )}
    </div>
  );
}
