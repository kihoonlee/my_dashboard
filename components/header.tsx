"use client";

// Owllet 스타일 헤더 — 모바일 햄버거 + ⌘K 검색 + 알림 종 + 테마.
// minimal, 충분한 padding, 옅은 border.

import { Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandPalette } from "@/components/command-palette";
import { useSidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";

export function Header() {
  const { open: openPalette } = useCommandPalette();
  const { setOpen: setSidebarOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 h-14">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 -ml-2 rounded-full hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="메뉴 열기"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <button
        onClick={openPalette}
        type="button"
        aria-label="검색 또는 명령 팔레트 열기 (⌘K)"
        className="flex items-center gap-2 rounded-full bg-muted/60 px-4 min-h-9 text-sm text-muted-foreground hover:bg-muted transition-colors flex-1 min-w-0 max-w-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left truncate">검색하거나 명령 입력…</span>
        <kbd className="hidden sm:inline rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground shrink-0">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
