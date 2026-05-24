"use client";

// Owllet 스타일 narrow icon sidebar — 약 72px width.
// 아이콘 + 짧은 라벨(2-3자) 세로 배치, 활성 항목은 검은 chip 배경.
// 모바일은 햄버거 → 드로어 (full width로 확장).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CheckSquare,
  BookOpen,
  StickyNote,
  Calendar,
  MessageCircle,
  Users,
  Bell,
  Bot,
  Settings,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MENU_ITEMS: MenuItem[] = [
  { href: "/", label: "홈", icon: Home },
  { href: "/diary", label: "일기", icon: BookOpen },
  { href: "/memos", label: "메모", icon: StickyNote },
  { href: "/todos", label: "할일", icon: CheckSquare },
  { href: "/calendar", label: "캘린더", icon: Calendar },
  { href: "/chat", label: "대화", icon: MessageCircle },
  { href: "/discussions", label: "토론", icon: Users },
  { href: "/notifications", label: "알림", icon: Bell },
];

const FOOTER_ITEMS: MenuItem[] = [
  { href: "/agents", label: "팀", icon: Bot },
  { href: "/settings", label: "설정", icon: Settings },
];

// ─────────────────────────────────────────────────────────
type SidebarCtx = { open: boolean; setOpen: (v: boolean) => void };
const SidebarContext = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be inside SidebarProvider");
  return ctx;
}

// ─────────────────────────────────────────────────────────
function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex flex-col items-center justify-center gap-0.5 mx-2 my-0.5 rounded-2xl py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-medium leading-none">{label}</span>
      </Link>
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    },
    [setOpen],
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleEsc]);

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[72px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200",
          open ? "translate-x-0 flex" : "-translate-x-full hidden",
          "md:static md:flex md:translate-x-0",
        )}
      >
        {/* 로고 영역 */}
        <div className="flex items-center justify-center py-4 border-b border-sidebar-border">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-foreground text-background text-xs font-bold tracking-tight"
            title="MyHub"
          >
            MH
          </Link>
        </div>

        {/* + 신규 진입 (대화 시작) */}
        <div className="px-2 pt-2">
          <Link
            href="/chat?agent=main"
            title="혜원에게 대화 시작"
            className="flex flex-col items-center justify-center gap-0.5 mx-0 rounded-2xl py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition"
          >
            <Plus className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium leading-none">새 대화</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          <ul className="flex flex-col">
            {MENU_ITEMS.map(({ href, label, icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                Icon={icon}
                active={isActive(href)}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border py-1">
          <ul className="flex flex-col">
            {FOOTER_ITEMS.map(({ href, label, icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                Icon={icon}
                active={isActive(href)}
              />
            ))}
          </ul>
        </div>

        {/* 모바일 닫기 */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-2 right-2 inline-flex items-center justify-center min-h-9 min-w-9 rounded-full hover:bg-sidebar-accent text-muted-foreground"
          aria-label="사이드바 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </aside>
    </>
  );
}
