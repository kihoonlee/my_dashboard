"use client";

// 글로벌 헤더 — 검색/명령 트리거 + 다크모드 토글.
// ⌘K (Mac) / Ctrl+K (Win·Linux) 단축키 또는 검색 박스 클릭으로 명령 팔레트 오픈.

import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandPalette } from "@/components/command-palette";

export function Header() {
  const { open } = useCommandPalette();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 h-14">
      <button
        onClick={open}
        type="button"
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-full max-w-md"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">검색하거나 명령 입력…</span>
        <kbd className="hidden sm:inline rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
