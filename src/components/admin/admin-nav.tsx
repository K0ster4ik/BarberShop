"use client";

import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  type LucideIcon,
  Scissors,
  TicketPercent,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AdminSection } from "@/server/auth/access";
import type { NavItem } from "./nav-items";

const ICONS: Record<AdminSection, LucideIcon> = {
  today: CalendarCheck,
  calendar: CalendarDays,
  bookings: ClipboardList,
  clients: Users,
  masters: UserRound,
  services: Scissors,
  promoCodes: TicketPercent,
  analytics: ChartColumn,
  users: UserCog,
};

export function AdminNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы CRM" className="flex flex-col gap-1 p-2">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.section];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
              // Текущий раздел: латунный текст и полоска слева. Подложка нейтральная:
              // на латунной латунный текст не набирает контраст 4,5:1.
              active
                ? "bg-sidebar-accent font-medium text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
