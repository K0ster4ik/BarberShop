// Настройки салона и записи (DESIGN.md, раздел 6.1).

export type SalonSettings = {
  timezone: string;
  slotStepMin: number; // шаг сетки времени; должен делить 30 минут
  defaultBufferMin: number; // уборка после записи, если у услуги не задан свой буфер
  minLeadTimeMin: number; // нельзя записаться ближе чем за это время
  bookingHorizonDays: number; // запись на столько дней вперёд, считая сегодняшний
  clientCancelLeadTimeMin: number; // клиент может отменить запись не позже чем за это время
};

export const salon = {
  timezone: "Europe/Moscow",
  slotStepMin: 15,
  defaultBufferMin: 10,
  minLeadTimeMin: 60, // нельзя записаться ближе чем за час
  bookingHorizonDays: 30,
  clientCancelLeadTimeMin: 120, // клиент может отменить запись не позже чем за 2 часа
} as const satisfies SalonSettings;
