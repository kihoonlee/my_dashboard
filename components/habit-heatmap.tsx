"use client";

// 90일 GitHub-스타일 히트맵 (단일 habit detail 페이지용).
// 가로축: 13주, 세로축: 7일 (월~일).
// 클릭 시 부모에 날짜 전달 (노트 편집용).

import { cn } from "@/lib/utils";
import type { HeatmapCell } from "@/lib/habits/streak";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function HabitHeatmap({
  cells,
  onCellClick,
}: {
  cells: HeatmapCell[];
  onCellClick?: (cell: HeatmapCell) => void;
}) {
  // 7일 × 13주 grid로 재배치. 첫 칸의 요일에 맞춰 빈 셀 패딩.
  // cells는 시간순(오래된 → 최신).
  if (cells.length === 0) return null;

  const firstDate = new Date(cells[0].date);
  const firstDow = (firstDate.getDay() + 6) % 7; // 월=0 ~ 일=6
  const padded: (HeatmapCell | null)[] = Array(firstDow).fill(null);
  padded.push(...cells);

  // 7개씩 묶어 컬럼으로
  const columns: (HeatmapCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    columns.push(padded.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      <div className="flex flex-col gap-0.5 pt-1 pr-1 shrink-0">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="h-3 text-[9px] text-muted-foreground/70 font-mono leading-3"
          >
            {d}
          </div>
        ))}
      </div>
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-0.5 shrink-0">
          {col.map((cell, ri) =>
            !cell ? (
              <div key={ri} className="w-3 h-3" />
            ) : (
              <button
                key={ri}
                type="button"
                onClick={() => onCellClick?.(cell)}
                className={cn(
                  "w-3 h-3 rounded-sm border border-border/60 transition-colors",
                  cell.completed === true && "bg-primary border-primary",
                  cell.completed === false && "bg-destructive/20 border-destructive/40",
                  cell.completed === null && "bg-muted/40",
                  cell.note && "ring-1 ring-amber-400/60",
                )}
                title={`${cell.date}${
                  cell.completed === true
                    ? " · 완료"
                    : cell.completed === false
                      ? " · 미완료"
                      : " · 기록 없음"
                }${cell.note ? ` · 노트: ${cell.note}` : ""}`}
                aria-label={cell.date}
              />
            ),
          )}
          {col.length < 7 &&
            Array.from({ length: 7 - col.length }).map((_, i) => (
              <div key={`pad-${i}`} className="w-3 h-3" />
            ))}
        </div>
      ))}
    </div>
  );
}
