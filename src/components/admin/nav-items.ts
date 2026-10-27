import type { Role } from "@/generated/prisma/enums";
import { type AdminSection, SECTION_ROLES } from "@/server/auth/access";

export type NavItem = {
  section: AdminSection;
  href: string;
  label: string;
};

const NAV_ITEMS: readonly NavItem[] = [
  { section: "today", href: "/admin", label: "Сегодня" },
  { section: "calendar", href: "/admin/calendar", label: "Календарь" },
  { section: "bookings", href: "/admin/bookings", label: "Записи" },
  { section: "clients", href: "/admin/clients", label: "Клиенты" },
  { section: "masters", href: "/admin/masters", label: "Мастера" },
  { section: "services", href: "/admin/services", label: "Услуги" },
  { section: "promoCodes", href: "/admin/promo-codes", label: "Промокоды" },
  { section: "analytics", href: "/admin/analytics", label: "Аналитика" },
  { section: "users", href: "/admin/users", label: "Пользователи" },
];

/** Пункты меню, доступные роли. Сами страницы проверяют доступ ещё раз. */
export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    (SECTION_ROLES[item.section] as readonly Role[]).includes(role),
  );
}
