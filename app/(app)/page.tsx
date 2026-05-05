import { Button } from "@/components/ui/button";

const AGENTS = [
  { name: "혜원", english: "Hyewon", role: "오케스트레이터", color: "var(--agent-hyewon)" },
  { name: "하영", english: "Hayoung", role: "오늘 매니저", color: "var(--agent-hayoung)" },
  { name: "수민", english: "Soomin", role: "목표 코치", color: "var(--agent-soomin)" },
  { name: "서연", english: "Seoyeon", role: "지식 사서", color: "var(--agent-seoyeon)" },
  { name: "다솜", english: "Dasom", role: "캡처 비서", color: "var(--agent-dasom)" },
  { name: "현주", english: "Hyunju", role: "사업 매니저", color: "var(--agent-hyunju)" },
  { name: "도연", english: "Doyeon", role: "개발 도구", color: "var(--agent-doyeon)" },
  { name: "민영", english: "Minyoung", role: "뉴스 큐레이터", color: "var(--agent-minyoung)" },
  { name: "정연", english: "Jeongyeon", role: "메일 정리자", color: "var(--agent-jeongyeon)" },
  { name: "민지", english: "Minji", role: "메타 챗봇", color: "var(--agent-minji)" },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-background">
      <main className="flex flex-1 w-full max-w-5xl flex-col gap-12 py-16 px-6 sm:px-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Phase 0 · Day 1 · Setup Complete
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            MyHub
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground max-w-2xl">
            10명의 AI Agent 팀이 사업 운영과 개인 정보를 능동적으로 보좌하는
            1인용 정보 허브.
          </p>
          <div className="flex gap-3 mt-4">
            <Button>시작하기</Button>
            <Button variant="outline">기획서 보기</Button>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">우리 팀 (10명)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AGENTS.map((agent) => (
              <div
                key={agent.english}
                className="flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-2xl"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.name.charAt(0)}
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm text-foreground">
                    {agent.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {agent.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs text-muted-foreground border-t border-border pt-6">
          Next.js · Tailwind v4 · shadcn/ui · Pretendard · Toss Blue
        </footer>
      </main>
    </div>
  );
}
