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
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
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
