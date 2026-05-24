"use client";

// ⌘K 명령 팔레트.
// (app) layout에 mount하면 전역에서 ⌘K(Mac) / Ctrl+K(Win·Linux)로 토글.
// COMMANDS 배열에 명령 정의 — id / label / keywords / icon / (href | action).
// keyboard navigation: ArrowUp/Down + Enter, Escape 닫기.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  Home,
  LogOut,
  MessageSquare,
  Moon,
  PlusCircle,
  RefreshCw,
  Search,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

type Command = {
  id: string;
  label: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  href?: string;
  action?: () => void | Promise<void>;
  group?: "이동" | "액션";
};

type Ctx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const CommandPaletteCtx = createContext<Ctx | null>(null);

export function useCommandPalette(): Ctx {
  const ctx = useContext(CommandPaletteCtx);
  if (!ctx) {
    return { open: () => {}, close: () => {}, isOpen: false };
  }
  return ctx;
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandPaletteCtx.Provider value={{ open, close, isOpen }}>
      {children}
      {isOpen && <CommandPaletteModal onClose={close} />}
    </CommandPaletteCtx.Provider>
  );
}

function CommandPaletteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      {
        id: "nav-home",
        label: "홈",
        keywords: ["home", "dashboard", "홈"],
        icon: Home,
        href: "/",
        group: "이동",
      },
      {
        id: "nav-todos",
        label: "할일 (Todo)",
        keywords: ["todo", "할일", "todos"],
        icon: CheckSquare,
        href: "/todos",
        group: "이동",
      },
      {
        id: "nav-diary",
        label: "일기",
        keywords: ["diary", "일기"],
        icon: MessageSquare,
        href: "/diary",
        group: "이동",
      },
      {
        id: "nav-memos",
        label: "메모",
        keywords: ["memo", "memos", "메모"],
        icon: MessageSquare,
        href: "/memos",
        group: "이동",
      },
      {
        id: "nav-calendar",
        label: "캘린더",
        keywords: ["calendar", "캘린더"],
        icon: Calendar,
        href: "/calendar",
        group: "이동",
      },
      {
        id: "nav-chat",
        label: "에이전트 대화",
        keywords: ["chat", "대화", "에이전트"],
        icon: MessageSquare,
        href: "/chat?agent=main",
        group: "이동",
      },
      {
        id: "action-new-chat",
        label: "새 대화 시작 (혜원)",
        keywords: ["new", "chat", "새", "대화", "시작"],
        icon: PlusCircle,
        href: "/chat?agent=main",
        group: "액션",
      },
      {
        id: "nav-search",
        label: "통합 검색",
        keywords: ["search", "검색", "찾기"],
        icon: Search,
        href: "/search",
        group: "이동",
      },
      {
        id: "action-sync-calendar",
        label: "캘린더 동기화",
        keywords: ["sync", "calendar", "동기화", "캘린더"],
        icon: RefreshCw,
        action: async () => {
          setBusy("sync-calendar");
          setFeedback(null);
          try {
            const res = await fetch("/api/sync/calendar", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.status === 412) {
              setFeedback(
                "권한이 없습니다 — 다시 로그인이 필요합니다.",
              );
            } else if (!res.ok) {
              setFeedback(`동기화 실패: ${data?.message ?? res.status}`);
            } else {
              setFeedback(`동기화 완료 — ${data.upserts ?? 0}건`);
            }
          } catch (e) {
            setFeedback(
              `동기화 실패: ${e instanceof Error ? e.message : String(e)}`,
            );
          } finally {
            setBusy(null);
          }
        },
        group: "액션",
      },
      {
        id: "action-toggle-theme",
        label: theme === "dark" ? "라이트 모드" : "다크 모드",
        keywords: ["theme", "dark", "light", "테마", "모드"],
        icon: theme === "dark" ? Sun : Moon,
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
        },
        group: "액션",
      },
      {
        id: "action-signout",
        label: "로그아웃",
        keywords: ["logout", "signout", "로그아웃"],
        icon: LogOut,
        href: "/auth/signout",
        group: "액션",
      },
    ];

    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query, theme, setTheme]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function execute(cmd: Command) {
    if (cmd.href) {
      onClose();
      if (cmd.href.startsWith("/auth/")) {
        // /auth/signout 등은 server route 거쳐야 하니 full nav.
        window.location.href = cmd.href;
      } else {
        router.push(cmd.href);
      }
      return;
    }
    if (cmd.action) {
      await cmd.action();
      // 일부 액션은 결과 표시 후 직접 닫지 않음 (피드백 노출). 다른 액션(예: 테마)은 즉시 닫기.
      if (cmd.id === "action-toggle-theme") {
        onClose();
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = commands[activeIndex];
      if (cmd) execute(cmd);
    }
  }

  // 그룹별로 묶기 (filter 결과 안에서)
  const grouped: Array<{ group: string; items: Command[] }> = [];
  let currentGroup: string | null = null;
  let currentItems: Command[] = [];
  let runningIndex = 0;
  const indexMap = new Map<string, number>();
  for (const cmd of commands) {
    indexMap.set(cmd.id, runningIndex);
    runningIndex += 1;
    const g = cmd.group ?? "기타";
    if (g !== currentGroup) {
      if (currentGroup !== null) {
        grouped.push({ group: currentGroup, items: currentItems });
      }
      currentGroup = g;
      currentItems = [cmd];
    } else {
      currentItems.push(cmd);
    }
  }
  if (currentGroup !== null && currentItems.length > 0) {
    grouped.push({ group: currentGroup, items: currentItems });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-background/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl mx-4 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="명령 검색…"
          className="w-full px-4 py-3.5 text-sm bg-transparent border-b border-border focus:outline-none"
          aria-label="명령 검색"
        />
        <ul className="max-h-80 overflow-y-auto py-1.5" role="listbox">
          {commands.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">
              결과 없음
            </li>
          ) : (
            grouped.map((g) => (
              <li key={g.group}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {g.group}
                </div>
                <ul>
                  {g.items.map((cmd) => {
                    const idx = indexMap.get(cmd.id) ?? -1;
                    const Icon = cmd.icon;
                    const active = idx === activeIndex;
                    return (
                      <li
                        key={cmd.id}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => execute(cmd)}
                        role="option"
                        aria-selected={active}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/90",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{cmd.label}</span>
                        {busy === cmd.id.replace(/^action-/, "") && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            진행 중…
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
        {feedback && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {feedback}
          </div>
        )}
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground/70 flex items-center gap-3 justify-between">
          <span>↑↓ 이동 · Enter 실행 · Esc 닫기</span>
          <kbd className="font-mono">⌘K</kbd>
        </div>
      </div>
    </div>
  );
}
