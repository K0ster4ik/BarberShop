import { salon } from "@/config/salon";
import type {
  Booking,
  BookingItem,
  Client,
  ClientNote,
  ClientTag,
  Master,
  MasterPromotion,
  MasterService,
  Payment,
  PromoCode,
  Service,
  ServiceCategory,
  Tag,
  TimeOff,
  WorkingHours,
} from "@/generated/prisma/client";
import type { BookingSource, BookingStatus } from "@/generated/prisma/enums";
import {
  addDays,
  addMinutes,
  salonTimeToInstant,
  toSalonDate,
  weekdayOf,
} from "@/lib/time";
import { bookingBufferMin, calculatePricing } from "@/server/pricing/calculate";
import type { Discount } from "@/server/pricing/discount";
import {
  BOOKING_COMMENTS,
  CATEGORIES,
  CLIENT_NOTES,
  DEMO_USERS,
  EMAIL_DOMAINS,
  FEMALE_FIRST_NAMES,
  LAST_NAMES,
  MALE_FIRST_NAMES,
  MASTERS,
  PROMO_CODES,
  SERVICE_COMBOS,
  SERVICES,
  type ServiceKey,
  TAGS,
} from "./catalog";
import { createRandom, type Random } from "./random";

export const DEMO_SEED = 20_261_027;
export const PAST_DAYS = 90;
export const FUTURE_DAYS = 14;
const CLIENT_COUNT = 400;

/** updatedAt выставляет Prisma при вставке. */
type Row<T> = Omit<T, "updatedAt">;

export type DemoData = {
  categories: ServiceCategory[];
  services: Row<Service>[];
  masters: Row<Master>[];
  masterServices: MasterService[];
  workingHours: WorkingHours[];
  timeOffs: TimeOff[];
  promotions: Row<MasterPromotion>[];
  promoCodes: Row<PromoCode>[];
  tags: Tag[];
  clients: Row<Client>[];
  clientTags: ClientTag[];
  clientNotes: ClientNote[];
  bookings: Row<Booking>[];
  bookingItems: BookingItem[];
  payments: Payment[];
};

type ClientProfile = {
  row: Row<Client>;
  weight: number;
  minGapDays: number;
  joinDay: number;
  leaveDay: number;
  favoriteMaster: number | null;
  isRegular: boolean;
  discount: Discount | null;
  lastVisitDay: number;
  hasUpcoming: boolean;
};

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`Demo catalog is inconsistent: ${what}`);
  return value;
}

function isWithin(at: Date, from: Date | null, until: Date | null): boolean {
  return (from === null || from <= at) && (until === null || at < until);
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** Доля занятого времени: пятница и суббота загружены сильнее, будущее заполнено частично. */
function fillRate(day: number, weekday: number): number {
  const base =
    weekday === 4 || weekday === 5 ? 0.78 : weekday === 0 ? 0.5 : 0.64;
  return day < 0 ? base : base * Math.max(0.2, 1 - day * 0.06);
}

const IDLE_STEPS = [15, 30, 30, 45, 60] as const;

/**
 * Демо-данные салона: ~90 дней истории и ~14 дней будущих записей
 * относительно `now`. Чистая функция: один и тот же `now` и `seed` дают одинаковый результат.
 *
 * Раскладка записей не зависит от времени суток в `now` (число случайных
 * выборов на запись фиксировано), от него зависят только статусы сегодняшних записей.
 */
export function generateDemoData(options: {
  now: Date;
  seed?: number;
}): DemoData {
  const { now } = options;
  const rng = createRandom(options.seed ?? DEMO_SEED);
  const today = toSalonDate(now);
  const at = (day: number, minutes: number) =>
    salonTimeToInstant(addDays(today, day), minutes);

  const adminId = must(
    DEMO_USERS.find((user) => user.key === "admin"),
    "admin user",
  ).id;
  const staffAuthorIds = DEMO_USERS.filter((user) => user.key !== "owner").map(
    (user) => user.id,
  );

  // ─────────── Справочники ───────────

  const categories: ServiceCategory[] = CATEGORIES.map((name, index) => ({
    id: rng.id(),
    name,
    sortOrder: index,
  }));
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  const services: Row<Service>[] = SERVICES.map((def, index) => ({
    id: rng.id(),
    categoryId: must(categoryIdByName.get(def.category), def.category),
    name: def.name,
    description: def.description,
    durationMin: def.durationMin,
    price: def.price,
    bufferMin: "bufferMin" in def ? def.bufferMin : null,
    isActive: true,
    sortOrder: index,
    createdAt: at(-400, 600),
  }));
  const serviceByKey = new Map(
    SERVICES.map((def, index) => [def.key, must(services[index], def.key)]),
  );

  const masters: Row<Master>[] = MASTERS.map((def, index) => ({
    id: rng.id(),
    userId:
      "userKey" in def
        ? must(
            DEMO_USERS.find((user) => user.key === def.userKey),
            def.userKey,
          ).id
        : null,
    name: def.name,
    title: def.title,
    bio: def.bio,
    photoPath: `masters/${def.photo}`,
    isActive: true,
    sortOrder: index,
    createdAt: at(-400, 600),
  }));
  const masterAt = (index: number) => must(masters[index], `master #${index}`);

  const masterServices: MasterService[] = MASTERS.flatMap((def, index) =>
    Object.entries(def.services).map(([key, [price, durationMin]]) => ({
      masterId: masterAt(index).id,
      serviceId: must(serviceByKey.get(key as ServiceKey), key).id,
      price,
      durationMin,
    })),
  );

  const workingHours: WorkingHours[] = MASTERS.flatMap((def, index) =>
    Object.entries(def.schedule).flatMap(([weekday, intervals]) =>
      intervals.map(([startMin, endMin]) => ({
        id: rng.id(),
        masterId: masterAt(index).id,
        weekday: Number(weekday),
        startMin,
        endMin,
      })),
    ),
  );

  const timeOffs: TimeOff[] = MASTERS.flatMap((def, index) =>
    ("timeOffs" in def ? def.timeOffs : []).map((off) => {
      const partial = "startMin" in off;
      return {
        id: rng.id(),
        masterId: masterAt(index).id,
        startsAt: at(off.fromDay, partial ? off.startMin : 0),
        endsAt: partial ? at(off.toDay, off.endMin) : at(off.toDay + 1, 0),
        reason: off.reason,
      };
    }),
  );

  const promotionDefs = MASTERS.flatMap((def, index) =>
    ("promotions" in def ? def.promotions : []).map((promo) => ({
      masterIndex: index,
      row: {
        id: rng.id(),
        masterId: masterAt(index).id,
        serviceId:
          "service" in promo
            ? must(serviceByKey.get(promo.service), promo.service).id
            : null,
        title: promo.title,
        kind: promo.kind,
        value: promo.value,
        validFrom: "validFromDay" in promo ? at(promo.validFromDay, 0) : null,
        validUntil:
          "validUntilDay" in promo ? at(promo.validUntilDay, 0) : null,
        isActive: true,
        createdById: adminId,
        createdAt: at(-60, 600),
      } satisfies Row<MasterPromotion>,
    })),
  );

  const promoCodes: Row<PromoCode>[] = PROMO_CODES.map((def) => ({
    id: rng.id(),
    code: def.code,
    kind: def.kind,
    value: def.value,
    validFrom: "validFromDay" in def ? at(def.validFromDay, 0) : null,
    validUntil: "validUntilDay" in def ? at(def.validUntilDay, 0) : null,
    maxUses: "maxUses" in def ? def.maxUses : null,
    isActive: true,
    createdAt: at(-150, 600),
  }));

  const tags: Tag[] = TAGS.map((def) => ({
    id: rng.id(),
    name: def.name,
    color: def.color,
  }));
  const tagIdByName = new Map(tags.map((tag) => [tag.name, tag.id]));

  // ─────────── Клиенты ───────────

  const usedPhones = new Set<string>();
  const profiles: ClientProfile[] = [];
  for (let index = 0; index < CLIENT_COUNT; index++) {
    profiles.push(createClientProfile(rng, usedPhones));
  }

  const allClients = profiles.map((p) => [p, p.weight] as const);
  const favoritesByMaster = MASTERS.map((_, masterIndex) =>
    allClients.filter(([p]) => p.favoriteMaster === masterIndex),
  );

  function pickClient(day: number, masterIndex: number): ClientProfile | null {
    const favorites = favoritesByMaster[masterIndex] ?? [];
    const pool =
      rng.chance(0.6) && favorites.length > 0 ? favorites : allClients;
    for (let attempt = 0; attempt < 25; attempt++) {
      const client = rng.weighted(pool);
      if (day < client.joinDay || day > client.leaveDay) continue;
      if (day - client.lastVisitDay < client.minGapDays) continue;
      if (day >= 0 && client.hasUpcoming) continue;
      return client;
    }
    return null;
  }

  // ─────────── Записи ───────────

  const bookings: Row<Booking>[] = [];
  const bookingItems: BookingItem[] = [];
  const payments: Payment[] = [];
  const firstBookingAt = new Map<ClientProfile, Date>();

  function pickCombo(masterIndex: number): readonly ServiceKey[] {
    const offered = must(
      MASTERS[masterIndex],
      `master #${masterIndex}`,
    ).services;
    for (let attempt = 0; attempt < 10; attempt++) {
      const combo = rng.weighted(SERVICE_COMBOS);
      if (combo.every((key) => key in offered)) return combo;
    }
    return ["haircut"];
  }

  function promotionsOf(masterIndex: number) {
    return promotionDefs
      .filter((promo) => promo.masterIndex === masterIndex)
      .map((promo) => promo.row);
  }

  function overlapsTimeOff(masterId: string, start: Date, end: Date): boolean {
    return timeOffs.some(
      (off) =>
        off.masterId === masterId && off.startsAt < end && start < off.endsAt,
    );
  }

  for (let day = -PAST_DAYS; day <= FUTURE_DAYS; day++) {
    const weekday = weekdayOf(addDays(today, day));
    const fill = fillRate(day, weekday);

    MASTERS.forEach((def, masterIndex) => {
      const master = masterAt(masterIndex);
      const intervals: readonly (readonly [number, number])[] =
        (
          def.schedule as Partial<
            Record<number, readonly (readonly [number, number])[]>
          >
        )[weekday] ?? [];

      for (const [shiftStart, shiftEnd] of intervals) {
        let cursor = shiftStart;
        while (cursor < shiftEnd) {
          if (!rng.chance(fill)) {
            cursor += rng.pick(IDLE_STEPS);
            continue;
          }

          const combo = pickCombo(masterIndex);
          const offered = def.services as Partial<
            Record<ServiceKey, readonly [number, number]>
          >;
          const lines = combo.map((key) => {
            const [basePrice, durationMin] = must(offered[key], key);
            return {
              key,
              service: must(serviceByKey.get(key), key),
              basePrice,
              durationMin,
            };
          });
          const durationMin = lines.reduce(
            (sum, line) => sum + line.durationMin,
            0,
          );
          const bufferMin = bookingBufferMin(
            lines.map((line) => line.service),
            salon,
          );

          const startMin = ceilTo(cursor, salon.slotStepMin);
          if (startMin + durationMin > shiftEnd) break;

          const startsAt = at(day, startMin);
          const endsAt = addMinutes(startsAt, durationMin);
          const blockedUntil = addMinutes(endsAt, bufferMin);
          if (overlapsTimeOff(master.id, startsAt, blockedUntil)) {
            cursor = startMin + salon.slotStepMin;
            continue;
          }

          const client = pickClient(day, masterIndex);
          if (client === null) {
            cursor = startMin + 30;
            continue;
          }
          client.lastVisitDay = day;
          if (day >= 0) client.hasUpcoming = true;

          // Фиксированное число случайных выборов на запись, см. комментарий к функции.
          const roll = {
            id: rng.id(),
            status: rng.next(),
            source: rng.next(),
            lead: rng.next(),
            promo: rng.next(),
            promoPick: rng.next(),
            payment: rng.next(),
            split: rng.next(),
            cancelledBy: rng.next(),
            comment: rng.next(),
            itemIds: lines.map(() => rng.id()),
          };

          // Источник и статус.
          let source: BookingSource =
            roll.source < 0.55
              ? "WEBSITE"
              : roll.source < 0.85
                ? "PHONE"
                : "WALK_IN";
          if (source === "WALK_IN" && startsAt > now) source = "PHONE";

          // Пришедшие «с улицы» не бывают неявками, поэтому у остальных порог выше:
          // в сумме выходит около 8% неявок (DESIGN.md, раздел 13).
          let status: BookingStatus;
          if (endsAt <= now) {
            status =
              source === "WALK_IN" || roll.status >= 0.13
                ? "COMPLETED"
                : roll.status < 0.04
                  ? "CANCELLED"
                  : "NO_SHOW";
          } else if (startsAt <= now) {
            status = "CONFIRMED"; // идёт прямо сейчас
          } else if (roll.status < 0.05) {
            status = "CANCELLED";
          } else {
            status =
              source === "WEBSITE" && roll.status < 0.35
                ? "PENDING"
                : "CONFIRMED";
          }

          let createdAt =
            source === "WALK_IN"
              ? addMinutes(startsAt, -5)
              : addMinutes(
                  startsAt,
                  -Math.round((0.5 + roll.lead * 9.5) * 24 * 60),
                );
          if (createdAt > now) {
            createdAt = addMinutes(now, -5 - Math.round(roll.lead * 600));
          }
          const lastMoment = startsAt < now ? startsAt : now;

          // Цены считает та же функция, что и запись с сайта (DESIGN.md, 7.3): скидка
          // мастера на услугу, затем скидка салона на запись.
          const manualDiscount = source !== "WEBSITE" && roll.promo > 0.97;
          const validCodes = promoCodes.filter((code) =>
            isWithin(createdAt, code.validFrom, code.validUntil),
          );
          const promoCode =
            !manualDiscount &&
            source === "WEBSITE" &&
            roll.promo < 0.12 &&
            validCodes.length > 0
              ? must(
                  validCodes[Math.floor(roll.promoPick * validCodes.length)],
                  "promo code",
                )
              : null;
          const pricing = calculatePricing({
            services: lines.map((line) => ({
              serviceId: line.service.id,
              basePrice: line.basePrice,
              durationMin: line.durationMin,
              bufferMin: line.service.bufferMin,
            })),
            promotions: promotionsOf(masterIndex),
            visitAt: startsAt,
            now: createdAt,
            promoCode: promoCode && { ...promoCode, uses: 0 },
            clientDiscount: manualDiscount ? null : client.discount,
            manualSalonDiscount: manualDiscount
              ? { kind: "PERCENT", value: 10 }
              : null,
            settings: salon,
          });
          const items: BookingItem[] = pricing.items.map((item, index) => ({
            id: must(roll.itemIds[index], "item id"),
            bookingId: roll.id,
            serviceId: item.serviceId,
            serviceName: must(lines[index], "line").service.name,
            basePrice: item.basePrice,
            masterDiscount: item.masterDiscount,
            price: item.price,
            isPriceManual: item.isPriceManual,
            durationMin: item.durationMin,
            promotionId: item.promotionId,
            sortOrder: index,
          }));
          const {
            subtotal,
            salonDiscount,
            salonDiscountSource,
            promoCodeId,
            totalPrice,
          } = pricing;

          const isConfirmed =
            status === "CONFIRMED" ||
            status === "COMPLETED" ||
            status === "NO_SHOW";
          const confirmedAt = !isConfirmed
            ? null
            : source === "WEBSITE"
              ? new Date(
                  Math.min(
                    addMinutes(createdAt, 25).getTime(),
                    lastMoment.getTime(),
                  ),
                )
              : createdAt;
          const cancelledAt =
            status === "CANCELLED"
              ? new Date((createdAt.getTime() + lastMoment.getTime()) / 2)
              : null;

          bookings.push({
            id: roll.id,
            clientId: client.row.id,
            masterId: master.id,
            startsAt,
            endsAt,
            blockedUntil,
            durationMin,
            isDurationManual: false,
            bufferMin,
            status,
            source,
            subtotal,
            salonDiscount,
            salonDiscountSource,
            promoCodeId,
            totalPrice,
            clientComment:
              source === "WEBSITE" && roll.comment < 0.15
                ? must(
                    BOOKING_COMMENTS[
                      Math.floor(
                        (roll.comment / 0.15) * BOOKING_COMMENTS.length,
                      )
                    ],
                    "comment",
                  )
                : null,
            cancelTokenHash: null,
            confirmedAt,
            cancelledAt,
            cancelledBy:
              status !== "CANCELLED"
                ? null
                : source === "WEBSITE" && roll.cancelledBy < 0.7
                  ? "CLIENT"
                  : "STAFF",
            deletedAt: null,
            createdById: source === "WEBSITE" ? null : adminId,
            createdAt,
          });
          bookingItems.push(...items);

          if (
            status === "COMPLETED" &&
            totalPrice > 0 &&
            roll.payment >= 0.03
          ) {
            if (roll.split < 0.06 && totalPrice >= 200) {
              const cash = Math.max(
                100,
                Math.floor((totalPrice * 0.4) / 100) * 100,
              );
              payments.push(
                {
                  id: `${roll.id}p1`,
                  bookingId: roll.id,
                  amount: cash,
                  method: "CASH",
                  paidAt: endsAt,
                },
                {
                  id: `${roll.id}p2`,
                  bookingId: roll.id,
                  amount: totalPrice - cash,
                  method: "CARD",
                  paidAt: endsAt,
                },
              );
            } else {
              payments.push({
                id: `${roll.id}p1`,
                bookingId: roll.id,
                amount: totalPrice,
                method: roll.payment < 0.38 ? "CASH" : "CARD",
                paidAt: endsAt,
              });
            }
          }

          const first = firstBookingAt.get(client);
          if (first === undefined || createdAt < first)
            firstBookingAt.set(client, createdAt);

          cursor = startMin + durationMin + bufferMin;
        }
      }
    });
  }

  // ─────────── Карточки клиентов: дата появления, теги, заметки ───────────

  const clients: Row<Client>[] = [];
  const clientTags: ClientTag[] = [];
  const clientNotes: ClientNote[] = [];

  for (const profile of profiles) {
    const joinedAt = at(Math.min(profile.joinDay, -1), 12 * 60);
    const first = firstBookingAt.get(profile);
    const createdAt =
      first !== undefined && first < joinedAt ? first : joinedAt;
    clients.push({ ...profile.row, createdAt });

    const extraTags = [
      rng.chance(0.06) ? "Опаздывает" : null,
      rng.chance(0.06) ? "Любит поговорить" : null,
      rng.chance(0.05) ? "Молчун" : null,
      rng.chance(0.04) ? "Чувствительная кожа" : null,
    ];
    const tagNames = [
      profile.discount !== null ? "VIP" : null,
      profile.isRegular ? "Постоянный" : null,
      ...extraTags,
    ].filter((name) => name !== null);
    for (const name of tagNames) {
      clientTags.push({
        clientId: profile.row.id,
        tagId: must(tagIdByName.get(name), name),
      });
    }

    const noteCount = rng.chance(0.25) ? rng.int(1, 2) : 0;
    for (let index = 0; index < noteCount; index++) {
      const id = rng.id();
      const text = rng.pick(CLIENT_NOTES);
      const authorId = rng.pick(staffAuthorIds);
      const fraction = rng.next();
      clientNotes.push({
        id,
        clientId: profile.row.id,
        authorId,
        text,
        createdAt: new Date(
          createdAt.getTime() +
            fraction * (now.getTime() - createdAt.getTime()),
        ),
      });
    }
  }

  return {
    categories,
    services,
    masters,
    masterServices,
    workingHours,
    timeOffs,
    promotions: promotionDefs.map((promo) => promo.row),
    promoCodes,
    tags,
    clients,
    clientTags,
    clientNotes,
    bookings,
    bookingItems,
    payments,
  };
}

function createClientProfile(
  rng: Random,
  usedPhones: Set<string>,
): ClientProfile {
  const isFemale = rng.chance(0.15);
  const [firstName, firstLatin] = isFemale
    ? rng.pick(FEMALE_FIRST_NAMES)
    : rng.pick(MALE_FIRST_NAMES);
  const [lastNameBase, lastLatinBase] = rng.pick(LAST_NAMES);
  const lastName = isFemale ? `${lastNameBase}а` : lastNameBase;
  const lastLatin = isFemale ? `${lastLatinBase}a` : lastLatinBase;

  let phone: string;
  do {
    phone = `+79${String(rng.int(0, 999_999_999)).padStart(9, "0")}`;
  } while (usedPhones.has(phone));
  usedPhones.add(phone);

  const hasEmail = rng.chance(0.4);
  const emailSuffix = rng.chance(0.5) ? String(rng.int(1, 99)) : "";
  const domain = rng.pick(EMAIL_DOMAINS);
  const hasBirthday = rng.chance(0.45);
  const birthday = new Date(
    Date.UTC(rng.int(1970, 2006), rng.int(0, 11), rng.int(1, 28)),
  );

  const kind = rng.weighted([
    ["regular", 25],
    ["occasional", 45],
    ["rare", 30],
  ] as const);
  const isRegular = kind === "regular";
  const favoriteRoll = rng.next();
  const favoriteMaster = rng.int(0, MASTERS.length - 1);
  const discountRoll = rng.next();
  const joinedBefore = rng.chance(0.5);
  const joinDay = joinedBefore
    ? rng.int(-400, -PAST_DAYS - 1)
    : rng.int(-PAST_DAYS, FUTURE_DAYS);
  // Часть клиентов перестаёт ходить: они становятся «спящими» в аналитике.
  const leaves = rng.chance(0.15);
  const leaveDay = Math.max(joinDay, -PAST_DAYS) + rng.int(10, 60);

  const discount: Discount | null =
    (isRegular && discountRoll < 0.15) || (!isRegular && discountRoll < 0.02)
      ? { kind: "PERCENT", value: isRegular ? 10 : 5 }
      : null;

  return {
    row: {
      id: rng.id(),
      name: `${firstName} ${lastName}`,
      phone,
      email: hasEmail
        ? `${firstLatin}.${lastLatin}${emailSuffix}@${domain}`
        : null,
      birthday: hasBirthday ? birthday : null,
      discountKind: discount?.kind ?? null,
      discountValue: discount?.value ?? null,
      createdAt: new Date(0), // уточняется после генерации записей
    },
    weight: isRegular ? 6 : kind === "occasional" ? 2 : 0.6,
    minGapDays: isRegular ? 12 : 18,
    joinDay,
    leaveDay: leaves && leaveDay < 0 ? leaveDay : Number.POSITIVE_INFINITY,
    favoriteMaster: isRegular || favoriteRoll < 0.5 ? favoriteMaster : null,
    isRegular,
    discount,
    lastVisitDay: Number.NEGATIVE_INFINITY,
    hasUpcoming: false,
  };
}
