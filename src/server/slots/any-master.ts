// «Любой мастер» (DESIGN.md, раздел 6.4): слоты всех подходящих мастеров в одном списке.

export type MasterSlots = {
  masterId: string;
  slots: readonly Date[];
  bookedMin: number; // занятые минуты мастера за этот день
};

export type CombinedSlot = {
  start: Date;
  // Мастера, свободные в это время, от наименее загруженного за день. Запись получает
  // первого; если его время успели занять, пробуем следующего.
  masterIds: string[];
};

export function combineMasterSlots(
  masters: readonly MasterSlots[],
): CombinedSlot[] {
  // sort устойчивая: при равной загрузке мастера остаются в исходном порядке.
  const byLoad = [...masters].sort((a, b) => a.bookedMin - b.bookedMin);
  const byTime = new Map<number, string[]>();
  for (const master of byLoad) {
    for (const slot of master.slots) {
      const time = slot.getTime();
      const masterIds = byTime.get(time);
      if (masterIds) masterIds.push(master.masterId);
      else byTime.set(time, [master.masterId]);
    }
  }
  return [...byTime]
    .sort(([a], [b]) => a - b)
    .map(([time, masterIds]) => ({ start: new Date(time), masterIds }));
}
