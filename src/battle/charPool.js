import { ADV_CHARS } from '../config/units.js';
import { HEROES, PREFIX_BUFFS } from '../config/words.js';

const POOL_CAP = 28;
const twoCharacterHeroChars = new Set(
  Object.keys(HEROES)
    .filter((name) => Array.from(name).length === 2)
    .flatMap((name) => Array.from(name)),
);
const threeCharacterHeroChars = new Set(
  Object.keys(HEROES)
    .filter((name) => Array.from(name).length === 3)
    .flatMap((name) => Array.from(name)),
);

function copiesFor(char) {
  if (PREFIX_BUFFS[char]) return 3;
  if (twoCharacterHeroChars.has(char)) return 2;
  if (threeCharacterHeroChars.has(char)) return 1;
  return 0;
}

export function createCharPool(unlockedChars) {
  const initial = {};
  const copies = [];
  const seen = new Set();

  for (const char of unlockedChars || []) {
    if (seen.has(char) || !ADV_CHARS[char]) continue;
    seen.add(char);
    const quantity = copiesFor(char);
    if (quantity === 0 || copies.length + quantity > POOL_CAP) continue;
    initial[char] = quantity;
    for (let i = 0; i < quantity; i++) copies.push(char);
  }

  return {
    draw(random = Math.random) {
      if (copies.length === 0) return null;
      const index = Math.min(copies.length - 1, Math.floor(random() * copies.length));
      return copies.splice(index, 1)[0];
    },

    remaining(char) {
      return copies.filter((entry) => entry === char).length;
    },

    remainingTotal() {
      return copies.length;
    },

    snapshot() {
      return Object.fromEntries(Object.entries(initial).map(([char, quantity]) => [char, {
        initial: quantity,
        remaining: copies.filter((entry) => entry === char).length,
      }]));
    },
  };
}
