// 玩家存档：金币 / 道具 / 已解锁进阶字 / 最高波次
import { loadData, saveData } from '../core/storage.js';

const DEFAULT_SAVE = {
  version: 1,
  gold: 300,
  items: { owned: {}, equippedActive: [], equippedPassive: [] }, // owned: { itemId: level }
  unlockedChars: ['精', '铁', '赵', '云', '吕', '布'],
  bestWave: 0,
  settings: { volume: 80 },
  // 难度：已解锁列表、无尽已解锁层数、各难度最佳波次、当前选择
  diff: { unlocked: ['easy'], endlessFloor: 1, best: {}, selected: { id: 'easy' } },
  // 装备：owned 为实例列表 [{uid,id,rarity,lvl}]，player/units 为槽位 → uid
  equipment: { owned: [], nextUid: 1, player: { '武器': null, '护甲': null, '饰品': null }, units: { '兵': null, '骑': null, '枪': null, '弓': null, '炮': null } },
  // 图鉴：各类已解锁 key
  codex: { base: [], prefix: [], hero: [] },
};

let data = null;

export function getSave() {
  if (!data) {
    const loaded = loadData('save', null);
    data = Object.assign({}, DEFAULT_SAVE, loaded || {});
    data.items = Object.assign({}, DEFAULT_SAVE.items, (loaded && loaded.items) || {});
    data.settings = Object.assign({}, DEFAULT_SAVE.settings, (loaded && loaded.settings) || {});
    data.diff = Object.assign({}, DEFAULT_SAVE.diff, (loaded && loaded.diff) || {});
    data.equipment = Object.assign({}, DEFAULT_SAVE.equipment, (loaded && loaded.equipment) || {});
    data.equipment.player = Object.assign({}, DEFAULT_SAVE.equipment.player, (loaded && loaded.equipment && loaded.equipment.player) || {});
    data.equipment.units = Object.assign({}, DEFAULT_SAVE.equipment.units, (loaded && loaded.equipment && loaded.equipment.units) || {});
    data.codex = Object.assign({}, DEFAULT_SAVE.codex, (loaded && loaded.codex) || {});
  }
  return data;
}

export function persist() {
  saveData('save', getSave());
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
