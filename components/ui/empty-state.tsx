// 빈 상태(Empty State) 공통 컴포넌트.
// "데이터 없음"을 단순 텍스트로 표시하는 대신 아이콘 + 제목 + 안내 + 액션 CTA로 구성.
// UX 가이드: empty-states (forms-feedback) — "Helpful message and action when no content"

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-dashed border-border rounded-xl px-6 py-10 flex flex-col items-center justify-center gap-3 text-center",
        className,
      )}
      role="status"
    >
      {Icon && (
        <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground/80">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
