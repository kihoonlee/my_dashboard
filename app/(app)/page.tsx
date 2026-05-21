// v2 홈 — 보조 에이전트(태오) 환영 Hero + 오늘의 카드들 (memos / todos / calendar 요약).
// Hero는 components/home-hero.tsx 에서 보조 에이전트 SSE 응답을 받아 표시.
// 본격 디자인은 task 7 페이지 작업에서.

import { HomeHero } from "@/components/home-hero";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-background">
      <main className="flex flex-1 w-full max-w-5xl flex-col gap-8 py-10 px-6 sm:px-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            MyHub v2 · 에이전트 6명
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            홈
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
            일기 · 메모 · Todo · 캘린더. 각 도메인 옆에 전담 에이전트가 함께
            합니다.
          </p>
        </header>

        <HomeHero />

        <footer className="text-xs text-muted-foreground/70 border-t border-border pt-4">
          MyHub v2 · 1인 정보 허브 · 6명 AI 에이전트 (Anthropic Sonnet 4.6 / Haiku 4.5)
        </footer>
      </main>
    </div>
  );
}
