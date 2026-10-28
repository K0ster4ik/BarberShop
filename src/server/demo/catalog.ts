import type { DiscountKind, Role } from "@/generated/prisma/enums";

// Неслучайная часть демо: прайс, мастера, графики, справочники.
// Даты задаются в днях относительно «сегодня» по часам салона.

const rub = (rubles: number) => rubles * 100;
const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export const DEMO_USERS = [
  {
    id: "demo-user-owner",
    key: "owner",
    name: "Игорь Ковалёв",
    email: "owner@demo.ru",
    role: "OWNER",
  },
  {
    id: "demo-user-admin",
    key: "admin",
    name: "Мария Лебедева",
    email: "admin@demo.ru",
    role: "ADMIN",
  },
  {
    id: "demo-user-master",
    key: "master",
    name: "Артём Соколов",
    email: "master@demo.ru",
    role: "MASTER",
  },
] as const satisfies readonly {
  id: string;
  key: string;
  name: string;
  email: string;
  role: Role;
}[];

export type DemoUserKey = (typeof DEMO_USERS)[number]["key"];

export const DEMO_USER_IDS: readonly string[] = DEMO_USERS.map(
  (user) => user.id,
);

/** Общая демо-учётка: в режиме демо её нельзя «угнать» (сменить пароль, выкинуть чужие сессии). */
export function isDemoUser(userId: string): boolean {
  return DEMO_USER_IDS.includes(userId);
}

export const CATEGORIES = [
  "Стрижки",
  "Борода",
  "Комплексы",
  "Окрашивание",
] as const;

type ServiceDef = {
  key: string;
  category: (typeof CATEGORIES)[number];
  name: string;
  description: string;
  durationMin: number;
  price: number;
  bufferMin?: number;
};

export const SERVICES = [
  {
    key: "haircut",
    category: "Стрижки",
    name: "Мужская стрижка",
    description: "Стрижка ножницами и машинкой, мытьё головы, укладка.",
    durationMin: 60,
    price: rub(1800),
  },
  {
    key: "clipper",
    category: "Стрижки",
    name: "Стрижка машинкой",
    description: "Одна или две насадки, окантовка.",
    durationMin: 30,
    price: rub(1000),
  },
  {
    key: "kids",
    category: "Стрижки",
    name: "Детская стрижка",
    description: "Для детей до 12 лет.",
    durationMin: 45,
    price: rub(1200),
  },
  {
    key: "long",
    category: "Стрижки",
    name: "Стрижка на длинные волосы",
    description: "Сложные формы и длина от 15 см.",
    durationMin: 75,
    price: rub(2500),
  },
  {
    key: "beard",
    category: "Борода",
    name: "Оформление бороды",
    description: "Форма, контуры, уход маслом.",
    durationMin: 30,
    price: rub(1000),
  },
  {
    key: "shave",
    category: "Борода",
    name: "Королевское бритьё",
    description: "Бритьё опасной бритвой с горячим полотенцем.",
    durationMin: 45,
    price: rub(1500),
  },
  {
    key: "haircut_beard",
    category: "Комплексы",
    name: "Стрижка + борода",
    description: "Мужская стрижка и оформление бороды.",
    durationMin: 90,
    price: rub(2500),
  },
  {
    key: "father_son",
    category: "Комплексы",
    name: "Отец + сын",
    description: "Мужская и детская стрижка подряд.",
    durationMin: 90,
    price: rub(2800),
  },
  {
    key: "grey_camo",
    category: "Окрашивание",
    name: "Камуфляж седины",
    description: "Тонирование седых волос, естественный результат.",
    durationMin: 30,
    price: rub(1200),
    bufferMin: 15,
  },
  {
    key: "beard_tint",
    category: "Окрашивание",
    name: "Тонирование бороды",
    description: "Ровный цвет бороды на 3–4 недели.",
    durationMin: 30,
    price: rub(1000),
    bufferMin: 15,
  },
] as const satisfies readonly ServiceDef[];

export type ServiceKey = (typeof SERVICES)[number]["key"];

type Interval = readonly [startMin: number, endMin: number];

type MasterDef = {
  name: string;
  title: string;
  bio: string;
  /** Файл в prisma/seed-assets/masters/ — сброс демо копирует его в загрузки. */
  photo: string;
  userKey?: DemoUserKey;
  /** weekday (0 = Пн) → рабочие интервалы */
  schedule: Partial<Record<number, readonly Interval[]>>;
  /** услуга → [цена, длительность]; длительность у мастера может быть нестандартной */
  services: Partial<
    Record<ServiceKey, readonly [price: number, durationMin: number]>
  >;
  promotions?: readonly {
    title: string;
    service?: ServiceKey;
    kind: DiscountKind;
    value: number;
    validFromDay?: number;
    validUntilDay?: number;
  }[];
  timeOffs?: readonly {
    fromDay: number;
    toDay: number; // включительно
    startMin?: number; // если не задано — весь день
    endMin?: number;
    reason: string;
  }[];
};

const fullShiftWithBreak: readonly Interval[] = [
  [h(10), h(14)],
  [h(15), h(20)],
];

export const MASTERS = [
  {
    name: "Артём Соколов",
    title: "Топ-барбер",
    bio: "8 лет в профессии. Классические и сложные мужские стрижки, бритьё опасной бритвой.",
    photo: "master-artem-sokolov-43bf632f.webp",
    userKey: "master",
    schedule: {
      1: fullShiftWithBreak,
      2: fullShiftWithBreak,
      3: fullShiftWithBreak,
      4: fullShiftWithBreak,
      5: fullShiftWithBreak,
    },
    services: {
      haircut: [rub(2200), 55],
      clipper: [rub(1200), 30],
      long: [rub(3000), 70],
      beard: [rub(1300), 30],
      shave: [rub(1800), 45],
      haircut_beard: [rub(3200), 85],
      father_son: [rub(3500), 90],
      grey_camo: [rub(1500), 30],
    },
  },
  {
    name: "Дмитрий Волков",
    title: "Барбер",
    bio: "Быстрые аккуратные стрижки и работа с бородой. Отлично ладит с детьми.",
    photo: "master-dmitry-volkov-2bf3acf6.webp",
    schedule: {
      0: [
        [h(11), h(15)],
        [h(16), h(21)],
      ],
      1: [
        [h(11), h(15)],
        [h(16), h(21)],
      ],
      2: [
        [h(11), h(15)],
        [h(16), h(21)],
      ],
      3: [
        [h(11), h(15)],
        [h(16), h(21)],
      ],
      4: [
        [h(11), h(15)],
        [h(16), h(21)],
      ],
    },
    services: {
      haircut: [rub(1800), 60],
      clipper: [rub(1000), 30],
      kids: [rub(1200), 45],
      beard: [rub(1000), 30],
      haircut_beard: [rub(2500), 90],
      father_son: [rub(2800), 90],
    },
    promotions: [
      {
        title: "−20% на оформление бороды",
        service: "beard",
        kind: "PERCENT",
        value: 20,
      },
    ],
    timeOffs: [
      { fromDay: 2, toDay: 2, startMin: h(12), endMin: h(14), reason: "Врач" },
    ],
  },
  {
    name: "Максим Орлов",
    title: "Барбер",
    bio: "Фейды, текстурные стрижки и длинные волосы. Работает длинными сменами.",
    photo: "master-maxim-orlov-ca90b0e5.webp",
    schedule: {
      0: [
        [h(10), h(15)],
        [h(16), h(22)],
      ],
      2: [
        [h(10), h(15)],
        [h(16), h(22)],
      ],
      4: [
        [h(10), h(15)],
        [h(16), h(22)],
      ],
      6: [
        [h(10), h(15)],
        [h(16), h(22)],
      ],
    },
    services: {
      haircut: [rub(1800), 60],
      clipper: [rub(900), 30],
      kids: [rub(1100), 45],
      long: [rub(2500), 75],
      beard: [rub(1000), 30],
      shave: [rub(1500), 45],
      haircut_beard: [rub(2500), 90],
    },
    timeOffs: [{ fromDay: 5, toDay: 9, reason: "Отпуск" }],
  },
  {
    name: "Алина Ким",
    title: "Барбер-колорист",
    bio: "Камуфляж седины и тонирование бороды, мужские стрижки.",
    photo: "master-alina-kim-cce4eb07.webp",
    schedule: {
      3: [[h(12), h(20)]],
      4: [[h(12), h(20)]],
      5: [[h(12), h(20)]],
      6: [[h(12), h(20)]],
    },
    services: {
      haircut: [rub(1900), 60],
      clipper: [rub(1000), 30],
      beard: [rub(1000), 30],
      haircut_beard: [rub(2600), 90],
      grey_camo: [rub(1200), 30],
      beard_tint: [rub(1000), 30],
    },
    promotions: [
      {
        title: "−300 ₽ на камуфляж седины",
        service: "grey_camo",
        kind: "AMOUNT",
        value: rub(300),
        validFromDay: -30,
        validUntilDay: 30,
      },
    ],
    timeOffs: [{ fromDay: -40, toDay: -38, reason: "Больничный" }],
  },
] as const satisfies readonly MasterDef[];

/** Что заказывают: набор услуг и его относительная частота. */
export const SERVICE_COMBOS: readonly (readonly [
  readonly ServiceKey[],
  number,
])[] = [
  [["haircut"], 34],
  [["haircut_beard"], 18],
  [["clipper"], 12],
  [["beard"], 9],
  [["kids"], 5],
  [["shave"], 4],
  [["long"], 4],
  [["grey_camo"], 4],
  [["haircut", "grey_camo"], 3],
  [["clipper", "beard"], 3],
  [["beard", "beard_tint"], 2],
  [["father_son"], 2],
];

export const PROMO_CODES = [
  { code: "WELCOME10", kind: "PERCENT", value: 10 },
  {
    code: "BARBER500",
    kind: "AMOUNT",
    value: rub(500),
    maxUses: 100,
    validUntilDay: 60,
  },
  {
    code: "SUMMER15",
    kind: "PERCENT",
    value: 15,
    validFromDay: -120,
    validUntilDay: -30,
  },
] as const satisfies readonly {
  code: string;
  kind: DiscountKind;
  value: number;
  maxUses?: number;
  validFromDay?: number;
  validUntilDay?: number;
}[];

export const TAGS = [
  { name: "VIP", color: "amber" },
  { name: "Постоянный", color: "emerald" },
  { name: "Опаздывает", color: "rose" },
  { name: "Любит поговорить", color: "sky" },
  { name: "Молчун", color: "slate" },
  { name: "Чувствительная кожа", color: "violet" },
] as const;

export const CLIENT_NOTES = [
  "Любит покороче на висках, сверху оставлять длину.",
  "Не разговаривать во время стрижки.",
  "Всегда опаздывает минут на 10 — ставить с запасом.",
  "Чувствительная кожа, после бритья только бальзам без спирта.",
  "Предпочитает стрижку только ножницами.",
  "Приходит с сыном, записывать на соседнее время.",
  "Просил напомнить про камуфляж седины через месяц.",
  "Пьёт эспрессо без сахара.",
  "Бороду не трогать, только контур.",
  "Носит очки — аккуратнее у висков.",
  "Хочет отрастить бороду, оформлять минимально.",
  "Оплачивает картой, просит чек на почту.",
];

export const BOOKING_COMMENTS = [
  "Хочу как на прошлой неделе",
  "Могу опоздать на 5 минут",
  "Первый раз у вас",
  "Пожалуйста, без укладки",
  "Хочу сменить стрижку, нужна консультация",
];

/** Имя по-русски и латиницей (для email). */
export const MALE_FIRST_NAMES = [
  ["Александр", "alexander"],
  ["Дмитрий", "dmitry"],
  ["Максим", "maxim"],
  ["Сергей", "sergey"],
  ["Андрей", "andrey"],
  ["Алексей", "alexey"],
  ["Артём", "artem"],
  ["Илья", "ilya"],
  ["Кирилл", "kirill"],
  ["Михаил", "mikhail"],
  ["Никита", "nikita"],
  ["Матвей", "matvey"],
  ["Роман", "roman"],
  ["Егор", "egor"],
  ["Арсений", "arseny"],
  ["Иван", "ivan"],
  ["Денис", "denis"],
  ["Евгений", "evgeny"],
  ["Даниил", "daniil"],
  ["Тимофей", "timofey"],
  ["Владислав", "vlad"],
  ["Игорь", "igor"],
  ["Павел", "pavel"],
  ["Руслан", "ruslan"],
  ["Марк", "mark"],
  ["Константин", "konstantin"],
  ["Олег", "oleg"],
  ["Глеб", "gleb"],
  ["Антон", "anton"],
  ["Виктор", "victor"],
] as const;

export const FEMALE_FIRST_NAMES = [
  ["Анна", "anna"],
  ["Мария", "maria"],
  ["Елена", "elena"],
  ["Ольга", "olga"],
  ["Наталья", "natalia"],
  ["Екатерина", "ekaterina"],
  ["Татьяна", "tatiana"],
  ["Ирина", "irina"],
  ["Юлия", "julia"],
  ["Светлана", "svetlana"],
] as const;

/** Мужская форма; женская получается добавлением «а» (все фамилии на -ов/-ев/-ин). */
export const LAST_NAMES = [
  ["Иванов", "ivanov"],
  ["Смирнов", "smirnov"],
  ["Кузнецов", "kuznetsov"],
  ["Попов", "popov"],
  ["Васильев", "vasiliev"],
  ["Петров", "petrov"],
  ["Новиков", "novikov"],
  ["Фёдоров", "fedorov"],
  ["Морозов", "morozov"],
  ["Алексеев", "alekseev"],
  ["Семёнов", "semenov"],
  ["Егоров", "egorov"],
  ["Павлов", "pavlov"],
  ["Козлов", "kozlov"],
  ["Степанов", "stepanov"],
  ["Николаев", "nikolaev"],
  ["Андреев", "andreev"],
  ["Макаров", "makarov"],
  ["Никитин", "nikitin"],
  ["Захаров", "zakharov"],
  ["Зайцев", "zaitsev"],
  ["Соловьёв", "soloviev"],
  ["Борисов", "borisov"],
  ["Яковлев", "yakovlev"],
  ["Григорьев", "grigoriev"],
  ["Романов", "romanov"],
  ["Воробьёв", "vorobiev"],
  ["Сергеев", "sergeev"],
  ["Кириллов", "kirillov"],
  ["Фролов", "frolov"],
  ["Александров", "alexandrov"],
  ["Дмитриев", "dmitriev"],
  ["Королёв", "korolev"],
  ["Гусев", "gusev"],
  ["Киселёв", "kiselev"],
  ["Ильин", "ilyin"],
  ["Максимов", "maximov"],
  ["Поляков", "polyakov"],
  ["Сорокин", "sorokin"],
  ["Виноградов", "vinogradov"],
  ["Белов", "belov"],
  ["Медведев", "medvedev"],
  ["Антонов", "antonov"],
  ["Тарасов", "tarasov"],
  ["Жуков", "zhukov"],
  ["Баранов", "baranov"],
] as const;

export const EMAIL_DOMAINS = ["mail.ru", "yandex.ru", "gmail.com"] as const;
