import { HomeHero } from "@/components/home-hero";
import { HomeDashboard } from "@/components/home-dashboard";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-background">
      <main className="flex flex-1 w-full max-w-5xl flex-col gap-8 py-10 px-6 sm:px-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            MyHub · 활성 Agent 9/10
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            홈
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
            10명의 AI Agent 팀이 사업 운영과 개인 정보를 능동적으로 보좌합니다.
          </p>
        </header>

        <HomeHero />

        <HomeDashboard />

        <footer className="text-xs text-muted-foreground/70 border-t border-border pt-4">
          MyHub · 1인 정보 허브 · 10명 AI Agent (Anthropic Sonnet 4.6 + Google Gemini 2.5/3.1)
        </footer>
      </main>
    </div>
  );
}
