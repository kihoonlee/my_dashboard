// v2 홈 — Owllet "추천 AI" 스타일 카드 그리드 + 보조 에이전트(민지) 인사 Hero.
// 6명 에이전트 카드는 클릭 시 /chat?agent=<englishName>로 이동.

import Link from "next/link";
import { HomeHero } from "@/components/home-hero";
import { DashboardWidgets } from "@/components/dashboard/widgets";
import { AgentAvatar } from "@/components/agent-badge";

type AgentCard = {
  id: string;
  name: string;
  role: string;
  description: string;
  tags: string[];
  badge?: { label: string; tone: "cream" | "peach" | "sky" | "mint" | "lilac" };
};

const AGENTS: AgentCard[] = [
  {
    id: "main",
    name: "혜원",
    role: "메인 비서 · CSO",
    description:
      "시장 트렌드를 실시간 검색해 인사이트를 전하고, 팀 토론을 진행해 결과 리포트를 제출합니다. 에이전트 헬스도 감시.",
    tags: ["시장 분석", "토론 진행"],
    badge: { label: "MyHub 추천", tone: "cream" },
  },
  {
    id: "assistant",
    name: "민지",
    role: "보조 · CTO",
    description:
      "당신을 누구보다 잘 아는 에이전트. 메인과 의도적으로 다른 관점을 제시해 결정에 견제 장치를 만듭니다.",
    tags: ["반대 시각", "사용자 컨텍스트"],
    badge: { label: "MyHub 추천", tone: "lilac" },
  },
  {
    id: "daily",
    name: "하영",
    role: "데일리 리포터",
    description:
      "매일 오전 8시 자동 실행. 어제 활동을 정리하고 메모·캘린더에서 오늘 해야 할 일을 추출해 todo로 옮깁니다.",
    tags: ["자동 실행", "어제 회고"],
    badge: { label: "오전 8시", tone: "mint" },
  },
  {
    id: "diary",
    name: "서연",
    role: "일기 어시스턴트",
    description:
      "일기 작성 사이드패널에서 이전 일기와 메모를 검색해 오늘 일기에 인용·삽입을 제안합니다.",
    tags: ["검색", "인용 제안"],
  },
  {
    id: "memo",
    name: "다솜",
    role: "메모 어시스턴트",
    description:
      "메모 작성 사이드패널에서 todo 상태, 일기, 이전 메모를 검색해 본문에 가져옵니다. 간단한 정리 작업에 강합니다.",
    tags: ["todo 요약", "메모 가져오기"],
  },
  {
    id: "calendar",
    name: "수민",
    role: "캘린더 어시스턴트",
    description:
      "자연어로 일정 등록. 월세·사업자 신고 같은 정기 일정을 미리 파악하고 사전 알림까지 챙깁니다.",
    tags: ["자연어 등록", "정기 일정"],
  },
];

const TONE_CLASS: Record<string, string> = {
  cream: "bg-[var(--pastel-cream)] text-amber-900 dark:text-amber-200",
  peach: "bg-[var(--pastel-peach)] text-orange-900 dark:text-orange-200",
  sky: "bg-[var(--pastel-sky)] text-blue-900 dark:text-blue-200",
  mint: "bg-[var(--pastel-mint)] text-emerald-900 dark:text-emerald-200",
  lilac: "bg-[var(--pastel-lilac)] text-purple-900 dark:text-purple-200",
};

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-background">
      <main className="flex flex-1 w-full max-w-6xl flex-col gap-10 py-10 px-6 sm:px-10">
        {/* 보조 에이전트 환영 Hero (자동 인사) */}
        <HomeHero />

        {/* 오늘의 운영 overview — 알림 · Todo · 캘린더 · 에이전트 활동 */}
        <DashboardWidgets />

        {/* 6명 에이전트 카드 그리드 — Owllet 추천 AI 스타일 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground text-sm font-semibold tracking-tight">
              ✦ 에이전트 팀
            </span>
            <span className="text-xs text-muted-foreground">
              6명 · 클릭하면 대화 시작
            </span>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/chat?agent=${a.id}`}
                  className="group relative flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 transition hover:border-foreground/20 hover:shadow-sm h-full"
                >
                  {a.badge && (
                    <span
                      className={`absolute top-5 right-5 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        TONE_CLASS[a.badge.tone]
                      }`}
                    >
                      {a.badge.label}
                    </span>
                  )}

                  <div className="flex items-center gap-3 pr-20">
                    <AgentAvatar englishName={a.id} size="lg" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-lg font-bold tracking-tight">
                        {a.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {a.role}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3 min-h-[3.9rem]">
                    {a.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {a.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="text-xs text-muted-foreground/70 pt-4">
          MyHub v2 · 1인 정보 허브 · 6명 AI 에이전트 (Anthropic Sonnet/Haiku)
        </footer>
      </main>
    </div>
  );
}
