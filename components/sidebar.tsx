"use client";

// Phase 0 Day 5 — 사이드바 11개 메뉴 골격.
// 각 페이지의 실제 라우트는 Phase 1+ 에서 채워진다.
// 비어있는 라우트는 일단 "/" 또는 placeholder. 클릭 가능하지만 페이지 자체는 미구현.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CheckSquare,
  Calendar,
  Target,
  BookOpen,
  Briefcase,
  Wrench,
  Newspaper,
  Mail,
  Bot,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phase: string; // 어느 Phase에서 구현될지 (참고용 툴팁)
};

const MENU_ITEMS: MenuItem[] = [
  { href: "/", label: "홈", icon: Home, phase: "Phase 0/2" },
  { href: "/today", label: "오늘", icon: CheckSquare, phase: "Phase 1" },
  { href: "/calendar", label: "캘린더", icon: Calendar, phase: "Phase 2" },
  { href: "/goals", label: "목표·회고", icon: Target, phase: "Phase 5 ✓" },
  { href: "/knowledge", label: "지식·옵시디언", icon: BookOpen, phase: "Phase 3 ✓" },
  { href: "/business", label: "사업·프로덕트", icon: Briefcase, phase: "Phase 4 ✓" },
  { href: "/dev", label: "개발 도구", icon: Wrench, phase: "Phase 4" },
  { href: "/news", label: "뉴스 브리핑", icon: Newspaper, phase: "Phase 5 ✓" },
  { href: "/mail", label: "메일", icon: Mail, phase: "Phase 5 ✓" },
  { href: "/agents", label: "AI 팀 (10명)", icon: Bot, phase: "Phase 6 ✓" },
  { href: "/settings", label: "설정", icon: Settings, phase: "Phase 7" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground">
            MyHub
          </span>
          <span className="text-xs text-muted-foreground">Phase 0</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="flex flex-col gap-0.5">
          {MENU_ITEMS.map(({ href, label, icon: Icon, phase }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={`${label} (${phase})`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-sidebar-accent/60"
          >
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}
