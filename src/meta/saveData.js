// 玩家存档：金币 / 道具 / 已解锁进阶字 / 最高波次
import { loadData, saveData } from '../core/storage.js';

const DEFAULT_SAVE = {
  version: 3,
  gold: 300,
  gems: 10,
  soulJade: 3,
  items: { owned: {}, equippedActive: [], equippedPassive: [] }, // owned: { itemId: level }
  unlockedChars: ['精', '铁', '赵', '云', '吕', '布'],
  bestWave: 0,
  settings: { volume: 80 },
  // 难度：已解锁列表、无尽已解锁层数、各难度最佳波次、当前选择
  diff: { unlocked: ['easy'], endlessFloor: 1, best: {}, selected: { id: 'easy' } },
  // 装备：owned 为实例列表 [{uid,id,rarity,lvl}]，player/units 为槽位 → uid
  equipment: { owned: [], nextUid: 1, player: { '武器': null, '护甲': null, '饰品': null }, units: { '兵': null, '骑': null, '枪': null, '弓': null, '炮': null } },
  // 图鉴：各类已解锁 key
  codex: { base: [], prefix: [], hero: [], elite: [], boss: [] },
  merit: { total: 0, claimed: {} },
  gacha: { smallPity: 0, bigPity: 0, history: [] },
  shop: { stock: [], initialized: false },
};

let data = null;

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function copyDefault(value) {
  if (Array.isArray(value)) return value.map(copyDefault);
  if (!isObject(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyDefault(child)]));
}

function mergeDefaults(defaults, saved) {
  const merged = {};
  const source = isObject(saved) ? saved : {};

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const savedValue = source[key];
    if (isObject(defaultValue)) {
      merged[key] = mergeDefaults(defaultValue, savedValue);
    } else {
      merged[key] = savedValue === undefined ? copyDefault(defaultValue) : savedValue;
    }
  }

  for (const [key, savedValue] of Object.entries(source)) {
    if (!(key in defaults)) merged[key] = savedValue;
  }

  return merged;
}

export function migrateSave(raw) {
  const migrated = mergeDefaults(DEFAULT_SAVE, raw);
  for (const [key, claimed] of Object.entries(migrated.merit.claimed)) {
    const legacyEndlessClaim = /^endless:([1-9]\d*)$/.exec(key);
    if (!legacyEndlessClaim) continue;
    const canonicalKey = 'endless:1:' + legacyEndlessClaim[1];
    if (!(canonicalKey in migrated.merit.claimed)) {
      migrated.merit.claimed[canonicalKey] = claimed;
    }
    delete migrated.merit.claimed[key];
  }
  migrated.version = 3;
  return migrated;
}

export function getSave() {
  if (!data) {
    const loaded = loadData('save', null);
    data = migrateSave(loaded);
  }
  return data;
}

export function persist() {
  saveData('save', getSave());
}

export function replaceSave(raw, options = {}) {
  data = migrateSave(raw);
  saveData('save', data, { notify: options.sync !== false });
  return data;
}

export function addGold(n) {
  getSave().gold += n;
  persist();
}

export function spendGold(n) {
  const s = getSave();
  if (s.gold < n) return false;
  s.gold -= n;
  persist();
  return true;
}

export function unlockChar(char) {
  const s = getSave();
  if (!s.unlockedChars.includes(char)) {
    s.unlockedChars.push(char);
    persist();
    return true;
  }
  return false;
}

// 装备入库：同 id 同稀有度自动合成升级
export function grantEquip(id, rarity) {
  const s = getSave();
  const dup = s.equipment.owned.find((e) => e.id === id && e.rarity === rarity);
  if (dup) {
    dup.lvl++;
    persist();
    return { inst: dup, merged: true };
  }
  const inst = { uid: s.equipment.nextUid++, id, rarity, lvl: 1 };
  s.equipment.owned.push(inst);
  persist();
  return { inst, merged: false };
}

export function equipByUid(uid) {
  if (uid == null) return null;
  return getSave().equipment.owned.find((e) => e.uid === uid) || null;
}
