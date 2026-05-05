"use client";

// Phase 0 Day 5 — 헤더 골격. ⌘K 명령 팔레트는 Phase 2에서 실제 동작 연결.
// 지금은 placeholder 검색 박스 + 다크모드 토글만.

import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  function handleSearchClick() {
    // Phase 2에서 ⌘K 팔레트 모달 오픈으로 교체 예정
    alert("⌘K 명령 팔레트는 Phase 2에서 활성화됩니다.");
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 h-14">
      <button
        onClick={handleSearchClick}
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
