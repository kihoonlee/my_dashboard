"use client";

// 플로팅 채팅 버튼 — 메인 비서(혜원)로 라우팅.

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingChatButton() {
  const pathname = usePathname();
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return null;

  return (
    <Link
      href="/chat?agent=main"
      aria-label="혜원에게 물어보기"
      title="혜원에게 물어보기"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-14 h-14 rounded-full text-white shadow-lg hover:opacity-90 transition-opacity active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        backgroundColor: "var(--agent-main)",
        boxShadow: "0 8px 16px -4px rgba(49, 130, 246, 0.35)",
      }}
    >
      <MessageCircle className="h-6 w-6" aria-hidden />
    </Link>
  );
}
