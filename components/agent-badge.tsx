// Agent 식별 배지. 영문명 → globals.css의 --agent-{englishName} 컬러 토큰 매핑.
// 채팅 메시지 / 활동 로그 / Agent 카드 등에서 공통 사용.

import Image from "next/image";
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

const AGENT_PROFILE_IMAGES: Record<string, string> = {
  hyewon: "/agents/hyewon.png",
  hayoung: "/agents/hayoung.png",
  soomin: "/agents/soomin.png",
  seoyeon: "/agents/seoyeon.png",
  dasom: "/agents/dasom.png",
  hyunju: "/agents/hyunju.png",
  doyeon: "/agents/doyeon.png",
  minyoung: "/agents/minyoung.png",
  jeongyeon: "/agents/jeongyeon.png",
  minji: "/agents/minji.png",
};

export function AgentAvatar({
  englishName,
  size = "md",
  className,
}: {
  englishName: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const koreanName = KOREAN_NAMES[englishName] ?? englishName;
  const initial = koreanName[0] ?? "?";
  const color = `var(--agent-${englishName})`;
  const imageSrc = AGENT_PROFILE_IMAGES[englishName];

  const sizeClass = {
    sm: "w-6 text-[10px]",
    md: "w-9 text-xs",
    lg: "w-14 text-sm",
    xl: "w-32 text-xl",
  }[size];
  const imageSize = {
    sm: "24px",
    md: "36px",
    lg: "56px",
    xl: "128px",
  }[size];

  return (
    <span
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md aspect-[3/4] flex items-center justify-center text-white font-semibold shrink-0",
        sizeClass,
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes={imageSize}
          className="object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}

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

  const sizeClasses = {
    sm: { avatar: "sm" as const, text: "text-xs" },
    md: { avatar: "md" as const, text: "text-sm" },
    lg: { avatar: "lg" as const, text: "text-base" },
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        showName ? "" : "shrink-0",
        className,
      )}
    >
      <AgentAvatar englishName={englishName} size={sizeClasses.avatar} />
      {showName && (
        <span className={cn("font-medium text-foreground", sizeClasses.text)}>
          {koreanName}
        </span>
      )}
    </span>
  );
}
