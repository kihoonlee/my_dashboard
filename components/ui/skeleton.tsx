// Skeleton placeholder — shadcn/ui 표준 패턴.
// 로딩 시 spinner 단독 사용 대신 컨텐츠 형태를 미리 보여주는 shimmer.
// prefers-reduced-motion 시 globals.css의 전역 룰로 animation duration이 0.01ms.

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 미리 만든 skeleton 묶음 — 자주 쓰는 패턴.
 * 호출 측에서 `<SkeletonLines count={3} />` 식으로 간단 사용.
 */
export function SkeletonLines({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            i === count - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border border-border bg-card rounded-xl p-4 flex flex-col gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
      <SkeletonLines count={2} />
    </div>
  );
}
