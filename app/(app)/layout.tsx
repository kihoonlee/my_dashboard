// (app) route group layout — 인증된 사용자만 접근. 사이드바 + 헤더 + 플로팅 채팅 셸.
// 인증/리다이렉트는 proxy.ts에서 처리하므로 이 레이아웃은 UI 셸에 집중.

import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { FloatingChatButton } from "@/components/floating-chat-button";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 min-h-svh">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <FloatingChatButton />
    </div>
  );
}
