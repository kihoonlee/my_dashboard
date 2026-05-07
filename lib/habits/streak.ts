// 단일 habit의 logs로 스트릭 + 90일 grid 계산.
// JS 전용 — DB 쿼리는 호출자가 처리.

export type HabitLog = {
  date: string; // YYYY-MM-DD
  completed: boolean;
  note: string | null;
};

export type StreakData = {
  current: number; // 현재 스트릭 (오늘 미체크여도 어제까지 연속이면 카운트)
  longest: number; // 최장 스트릭 (90일 윈도우 내)
  todayChecked: boolean;
  todayCompleted: boolean;
};

export type HeatmapCell = {
  date: string;
  completed: boolean | null; // null = 로그 없음
  note: string | null;
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 90일 grid (오늘 포함, 오늘 - 89일).
 * logs는 그 윈도우 내 데이터를 모두 포함해야 한다.
 */
export function buildHeatmap(logs: HabitLog[], days: number = 90): HeatmapCell[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const out: HeatmapCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = isoDate(d);
    const log = byDate.get(dateStr);
    out.push({
      date: dateStr,
      completed: log ? log.completed : null,
      note: log?.note ?? null,
    });
  }
  return out;
}

/**
 * 스트릭 계산.
 *
 * 규칙:
 * - "현재 스트릭": 오늘이 미체크면 어제부터 역순으로 walk. 오늘이 체크된 상태면 오늘부터 walk.
 *   `completed=true`인 연속 일수. `completed=false` 또는 로그 없는 날 = 중단.
 *   단, 오늘만 미체크인 경우(어제까지 N일 연속이면 N으로 표시 — '오늘 안 끊김' 정신).
 * - "최장 스트릭": 90일 윈도우 안에서의 max(완료 연속 길이).
 */
export function computeStreak(logs: HabitLog[]): StreakData {
  const heatmap = buildHeatmap(logs, 90);
  const todayCell = heatmap[heatmap.length - 1];
  const todayCompleted = todayCell.completed === true;
  const todayChecked = todayCell.completed !== null;

  // 오늘이 미체크면 어제부터, 체크면 오늘부터 walk
  let walkStart = heatmap.length - 1;
  if (!todayChecked) walkStart = heatmap.length - 2; // 어제부터

  let current = 0;
  for (let i = walkStart; i >= 0; i--) {
    if (heatmap[i].completed === true) current++;
    else break;
  }

  // 최장 스트릭 — 전체 윈도우 walk
  let longest = 0;
  let run = 0;
  for (const cell of heatmap) {
    if (cell.completed === true) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  return { current, longest, todayChecked, todayCompleted };
}

/**
 * 14일 완료율 — heatmap 끝 14일에서 (completed=true) / (completed!=null) ratio.
 */
export function completionRate14d(logs: HabitLog[]): {
  completed: number;
  logged: number;
  rate: number;
} {
  const heatmap = buildHeatmap(logs, 14);
  let completed = 0;
  let logged = 0;
  for (const c of heatmap) {
    if (c.completed === null) continue;
    logged++;
    if (c.completed) completed++;
  }
  return {
    completed,
    logged,
    rate: logged > 0 ? completed / logged : 0,
  };
}
