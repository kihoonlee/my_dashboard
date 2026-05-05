// Agent 식별 배지. 영문명 → globals.css의 --agent-{englishName} 컬러 토큰 매핑.
// 채팅 메시지 / 활동 로그 / Agent 카드 등에서 공통 사용.

import { cn } from "@/lib/utils";

const KOREAN_NAMES: Record<string, string> = {
  hyewon: "혜원",
  hayoung: "하영",
  soomin: "수민",
  seoyeon: "서연",
  dasom: "다솜",
  hyunju: "현주",
  doyeon: "도연",
  minyoung: "민영",
  jeongyeon: "정연",
  minji: "민지",
};

export function AgentBadge({
  englishName,
  size = "md",
  showName = true,
  className,
}: {
  englishName: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
}) {
  const koreanName = KOREAN_NAMES[englishName] ?? englishName;
  const initial = koreanName[0] ?? "?";
  const color = `var(--agent-${englishName})`;

  const sizeClasses = {
    sm: { dot: "w-5 h-5 text-[10px]", text: "text-xs" },
    md: { dot: "w-7 h-7 text-xs", text: "text-sm" },
    lg: { dot: "w-10 h-10 text-sm", text: "text-base" },
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        showName ? "" : "shrink-0",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full flex items-center justify-center text-white font-semibold shrink-0",
          sizeClasses.dot,
        )}
        style={{ backgroundColor: color }}
      >
        {initial}
      </span>
      {showName && (
        <span className={cn("font-medium text-foreground", sizeClasses.text)}>
          {koreanName}
        </span>
      )}
    </span>
  );
}
