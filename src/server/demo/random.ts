// Детерминированный генератор псевдослучайных чисел (mulberry32):
// один и тот же seed даёт одинаковые демо-данные после каждого сброса.

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 24;

export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1));
  }

  function pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined)
      throw new RangeError("Cannot pick from an empty list");
    return item;
  }

  function weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll < 0) return item;
    }
    const last = items.at(-1);
    if (last === undefined)
      throw new RangeError("Cannot pick from an empty list");
    return last[0];
  }

  return {
    next,
    int,
    pick,
    weighted,
    chance: (probability: number) => next() < probability,
    /** ID в духе cuid: «c» + 24 символа. */
    id: () => {
      let id = "c";
      for (let i = 0; i < ID_LENGTH; i++) id += pick([...ID_ALPHABET]);
      return id;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;
