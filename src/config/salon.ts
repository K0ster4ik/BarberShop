// Настройки салона и записи (DESIGN.md, раздел 6.1).
export const salon = {
  timezone: "Europe/Moscow",
  slotStepMin: 15, // шаг сетки времени
  defaultBufferMin: 10, // уборка после записи, если у услуги не задан свой буфер
  minLeadTimeMin: 60, // нельзя записаться ближе чем за час
  bookingHorizonDays: 30, // запись максимум на 30 дней вперёд
  clientCancelLeadTimeMin: 120, // клиент может отменить запись не позже чем за 2 часа
} as const;

export type SalonSettings = typeof salon;
