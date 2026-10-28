import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

// Правила доступа (DESIGN.md, раздел 4). Чистые функции без обращения к БД и cookies,
// поэтому их используют и страницы, и Server Actions, и юнит-тесты.

/** Сотрудник, от имени которого выполняется запрос. */
export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Для MASTER — его карточка мастера; для остальных ролей null. */
  masterId: string | null;
};

export const LOGIN_PATH = "/admin/login";
export const ADMIN_HOME_PATH = "/admin";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MASTER: "Мастер",
};

const ALL_STAFF = ["OWNER", "ADMIN", "MASTER"] as const;
const MANAGERS = ["OWNER", "ADMIN"] as const;

/** Управляют справочниками целиком: профили мастеров, услуги, промокоды. */
export const MANAGER_ROLES = MANAGERS;

/** Кто открывает разделы админки. Используют и меню, и сами страницы. */
export const SECTION_ROLES = {
  today: ALL_STAFF,
  calendar: ALL_STAFF,
  bookings: ALL_STAFF,
  clients: ALL_STAFF,
  masters: ALL_STAFF, // MASTER видит только свою карточку
  services: MANAGERS,
  promoCodes: MANAGERS,
  analytics: ["OWNER", "MASTER"], // MASTER — только выручку по своим записям
  users: ["OWNER"],
} as const satisfies Record<string, readonly Role[]>;

export type AdminSection = keyof typeof SECTION_ROLES;

/** Нарушение прав в сервисном слое; Server Actions превращают его в сообщение для UI. */
export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав для этого действия.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function canAccess(staff: StaffUser, roles: readonly Role[]): boolean {
  // Мастер без привязанной карточки не может работать ни с какими «своими» данными.
  if (staff.role === "MASTER" && staff.masterId === null) return false;
  return roles.includes(staff.role);
}

export function canOpenSection(
  staff: StaffUser,
  section: AdminSection,
): boolean {
  return canAccess(staff, SECTION_ROLES[section]);
}

function ownMasterId(staff: StaffUser): string {
  if (staff.masterId === null) throw new ForbiddenError();
  return staff.masterId;
}

/** MASTER может работать только со своей карточкой: ценами, акциями, графиком, записями. */
export function assertOwnMaster(staff: StaffUser, masterId: string): void {
  if (staff.role === "MASTER" && ownMasterId(staff) !== masterId) {
    throw new ForbiddenError();
  }
}

// Фильтры для запросов: подмешиваются в where, чтобы MASTER физически не получил чужие строки.

export function bookingScope(staff: StaffUser): Prisma.BookingWhereInput {
  return staff.role === "MASTER" ? { masterId: ownMasterId(staff) } : {};
}

export function clientScope(staff: StaffUser): Prisma.ClientWhereInput {
  return staff.role === "MASTER"
    ? { bookings: { some: { masterId: ownMasterId(staff), deletedAt: null } } }
    : {};
}

export function masterScope(staff: StaffUser): Prisma.MasterWhereInput {
  return staff.role === "MASTER" ? { id: ownMasterId(staff) } : {};
}

// Условный origin только для разбора относительных путей; наружу не попадает.
const PARSE_ORIGIN = "http://admin.invalid";

/**
 * Куда вернуть после входа. Принимаем только пути внутри админки, иначе
 * параметр `next` превратился бы в открытый редирект.
 *
 * Путь проверяется после нормализации так, как его разберёт браузер: иначе
 * `/admin/../admin/login` прошёл бы проверку и превратился в цикл редиректов,
 * а `/admin/../что-угодно` увёл бы за пределы админки.
 */
export function safeAdminPath(next: string | null | undefined): string {
  if (!next || next.includes("\\")) return ADMIN_HOME_PATH;

  let url: URL;
  try {
    url = new URL(next, PARSE_ORIGIN);
  } catch {
    return ADMIN_HOME_PATH;
  }
  // Абсолютные адреса и `//host/...` меняют origin.
  if (url.origin !== PARSE_ORIGIN) return ADMIN_HOME_PATH;

  const { pathname } = url;
  const insideAdmin =
    pathname === ADMIN_HOME_PATH || pathname.startsWith(`${ADMIN_HOME_PATH}/`);
  const isLogin =
    pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
  if (!insideAdmin || isLogin) return ADMIN_HOME_PATH;

  return pathname + url.search;
}
