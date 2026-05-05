"use client";

// Phase 0 Day 5 — 플로팅 채팅 버튼 골격. Phase 2에서 민지 채팅 모달과 연결.

import { MessageCircle } from "lucide-react";

export function FloatingChatButton() {
  function handleClick() {
    alert("민지 채팅은 Phase 2에서 활성화됩니다.");
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-label="민지 채팅 열기"
      title="민지 (Phase 2 활성화 예정)"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors active:translate-y-px"
      style={{ backgroundColor: "var(--agent-minji)" }}
    >
      <MessageCircle className="h-5 w-5" />
    </button>
  );
}
