"use client";

// 사이드바 — 데스크톱은 고정 컬럼, 모바일은 햄버거 → 좌측 드로어.
// 모바일 드로어 열기/닫기 상태는 useSidebar() 훅으로 노출.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CheckSquare,
  BookOpen,
  StickyNote,
  Calendar,
  MessageCircle,
  Users,
  Bell,
  Bot,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phase: string;
};

const MENU_ITEMS: MenuItem[] = [
  { href: "/", label: "홈", icon: Home, phase: "보조 환영" },
  { href: "/diary", label: "일기", icon: BookOpen, phase: "달이" },
  { href: "/memos", label: "메모", icon: StickyNote, phase: "노트" },
  { href: "/todos", label: "할일", icon: CheckSquare, phase: "Todo" },
  { href: "/calendar", label: "캘린더", icon: Calendar, phase: "시아" },
  { href: "/chat", label: "에이전트 대화", icon: MessageCircle, phase: "지원" },
  { href: "/discussions", label: "토론", icon: Users, phase: "메인 진행" },
  { href: "/notifications", label: "알림", icon: Bell, phase: "" },
  { href: "/agents", label: "AI 팀 (6명)", icon: Bot, phase: "관리" },
  { href: "/settings", label: "설정", icon: Settings, phase: "" },
];

// ─────────────────────────────────────────────────────────
// Mobile drawer 상태 컨텍스트
// ─────────────────────────────────────────────────────────
type SidebarCtx = { open: boolean; setOpen: (v: boolean) => void };
const SidebarContext = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be inside SidebarProvider");
  return ctx;
}

// ─────────────────────────────────────────────────────────
// 사이드바 본체
// ─────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();

  // 라우트 변경 시 모바일 드로어 자동 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // ESC로 닫기
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    },
    [setOpen],
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleEsc]);

  return (
    <>
      {/* 모바일 백드롭 */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200",
          // 모바일: 슬라이드 in/out
          open ? "translate-x-0 flex" : "-translate-x-full hidden",
          // 데스크톱: 항상 표시, 정적 위치
          "md:static md:flex md:translate-x-0 md:w-60 lg:w-64",
        )}
      >
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-foreground">
              MyHub
            </span>
            <span className="text-xs text-muted-foreground">v2</span>
          </Link>
          {/* 모바일 닫기 버튼 — 44px 터치 타깃 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 -mr-2 rounded-md hover:bg-sidebar-accent text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar"
            aria-label="사이드바 닫기"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <ul className="flex flex-col gap-0.5">
            {MENU_ITEMS.map(({ href, label, icon: Icon, phase }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={`${label} (${phase})`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar"
            >
              로그아웃
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
