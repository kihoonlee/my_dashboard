// 홈 대시보드 위젯 공통 타입.
// /api/home/dashboard 응답 형태와 일치.

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  bodyMd: string;
  readAt: string | null;
  createdAt: string;
};

export type CalendarUpcoming = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  calendarColorHex: string | null;
  calendarSummary: string | null;
};

export type AgentHourly = {
  hour: number;
  calls: number;
  costUsd: number;
};

export type PerAgent = {
  englishName: string;
  name: string;
  colorHex: string;
  avatarEmoji: string | null;
  dailyCostUsd: number;
  dailyCalls: number;
};

export type DashboardData = {
  notifications: {
    unread: number;
    recent: NotificationItem[];
  };
  todos: {
    dueToday: number;
    overdue: number;
    completedToday: number;
    completedThisWeek: number;
    totalActive: number;
  };
  calendar: {
    upcoming: CalendarUpcoming[];
  };
  agents: {
    dailyCostUsd: number;
    monthlyCostUsd: number;
    dailyCalls: number;
    dailyErrors: number;
    hourly: AgentHourly[];
    perAgent: PerAgent[];
  };
};
