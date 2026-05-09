"use client";

// 글로벌 헤더 — 모바일 햄버거 + 검색/명령 트리거 + 다크모드 토글.
// ⌘K (Mac) / Ctrl+K (Win·Linux) 단축키 또는 검색 박스 클릭으로 명령 팔레트 오픈.

import { Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandPalette } from "@/components/command-palette";
import { useSidebar } from "@/components/sidebar";

export function Header() {
  const { open: openPalette } = useCommandPalette();
  const { setOpen: setSidebarOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-3 sm:px-6 h-14">
      {/* 모바일 햄버거 — 44px 터치 타깃 (#4) */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 -ml-2 rounded-md hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="메뉴 열기"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <button
        onClick={openPalette}
        type="button"
        aria-label="검색 또는 명령 팔레트 열기 (단축키 ⌘K 또는 Ctrl+K)"
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 min-h-9 text-sm text-muted-foreground hover:bg-muted transition-colors flex-1 min-w-0 max-w-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left truncate">검색하거나 명령 입력…</span>
        <kbd className="hidden sm:inline rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground shrink-0">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
