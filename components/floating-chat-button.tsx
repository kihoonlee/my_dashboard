"use client";

// Phase 2 — 플로팅 채팅 버튼. /chat 페이지로 이동.
// 추후 Phase 2 후반에 모달 형식으로 변경 예정 (현재는 페이지 네비게이션이 더 단순).

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingChatButton() {
  const pathname = usePathname();
  // /chat 페이지에선 자기 자신이라 숨김
  if (pathname === "/chat") return null;

  return (
    <Link
      href="/chat"
      aria-label="민지에게 물어보기"
      title="민지에게 물어보기"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg hover:opacity-90 transition-opacity active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        backgroundColor: "var(--agent-minji)",
        boxShadow: "0 8px 16px -4px rgba(92, 124, 250, 0.35)",
      }}
    >
      <MessageCircle className="h-6 w-6" aria-hidden />
    </Link>
  );
}
