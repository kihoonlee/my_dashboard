import { HomeHero } from "@/components/home-hero";
import { AgentBadge } from "@/components/agent-badge";

const AGENTS = [
  { english: "hyewon", role: "오케스트레이터", phase: "Phase 2 활성" },
  { english: "hayoung", role: "오늘 매니저", phase: "Phase 1 활성" },
  { english: "soomin", role: "목표 코치", phase: "Phase 5" },
  { english: "seoyeon", role: "지식 사서", phase: "Phase 3" },
  { english: "dasom", role: "캡처 비서", phase: "Phase 3" },
  { english: "hyunju", role: "사업 매니저", phase: "Phase 4" },
  { english: "doyeon", role: "개발 도구", phase: "Phase 4" },
  { english: "minyoung", role: "뉴스 큐레이터", phase: "Phase 5" },
  { english: "jeongyeon", role: "메일 정리자", phase: "Phase 5" },
  { english: "minji", role: "메타 챗봇", phase: "Phase 2 활성" },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-background">
      <main className="flex flex-1 w-full max-w-5xl flex-col gap-10 py-10 px-6 sm:px-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Phase 2 · 민지 채팅 + 혜원 종합 브리핑 가동
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            MyHub
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-2xl">
            10명의 AI Agent 팀이 사업 운영과 개인 정보를 능동적으로 보좌하는
            1인용 정보 허브.
          </p>
        </header>

        <HomeHero />

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">우리 팀 (10명)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AGENTS.map((agent) => (
              <div
                key={agent.english}
                className="flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-2xl text-center"
              >
                <AgentBadge
                  englishName={agent.english}
                  size="lg"
                  showName={false}
                />
                <div className="flex flex-col gap-0.5">
                  <div className="text-xs text-muted-foreground">
                    {agent.role}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {agent.phase}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-muted-foreground border-t border-border pt-4">
          Next.js 16 · Tailwind v4 · shadcn/ui · Pretendard · Toss Blue · Sonnet 4.6 / Haiku 4.5
        </footer>
      </main>
    </div>
  );
}
