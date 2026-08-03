// 图鉴：普通文字 / 增益文字 / 进阶词组，摆放或组成即解锁，附金币奖励
import { BASE_UNITS } from './units.js';
import { PREFIX_BUFFS, HEROES } from './words.js';

export const CODEX_CATS = [
  { id: 'base',   name: '普通文字', keys: Object.keys(BASE_UNITS),   reward: 30 },
  { id: 'prefix', name: '增益文字', keys: Object.keys(PREFIX_BUFFS), reward: 80 },
  { id: 'hero',   name: '进阶词组', keys: Object.keys(HEROES),       reward: 150 },
];

// 集齐整类的额外奖励
export const CODEX_SET_BONUS = { base: 300, prefix: 500, hero: 1500 };

export const CODEX_META = {
  prefix: Object.fromEntries(Object.entries(PREFIX_BUFFS).map(([char, prefix]) => [char, {
    color: prefix.color,
    description: prefix.description,
    hint: prefix.codex.hint,
  }])),
};

export function codexCat(id) {
  return CODEX_CATS.find((c) => c.id === id);
}
