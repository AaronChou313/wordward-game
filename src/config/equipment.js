// 装备系统：玩家装备（3 槽）+ 将士武器（按兵种佩戴），稀有度 4 档，重复掉落自动合成升级
export const RARITIES = [
  { id: 'common', name: '普通', color: '#b8b8b8', mul: 1, weight: 60 },
  { id: 'fine',   name: '精良', color: '#6aa8e0', mul: 1.5, weight: 28 },
  { id: 'rare',   name: '稀有', color: '#b07ae0', mul: 2.2, weight: 10 },
  { id: 'epic',   name: '传说', color: '#e0a03a', mul: 3.2, weight: 2 },
];

export const PLAYER_SLOTS = ['武器', '护甲', '饰品'];
export const UNIT_SLOTS = ['兵', '骑', '枪', '弓', '炮'];

// 可佩戴武器的英雄名（全部字符解锁后才会出现在将士武器槽位）
export const HERO_NAMES = ['赵云', '吕布', '诸葛亮', '关羽', '张飞', '曹操', '周瑜', '马超', '黄忠', '貂蝉', '孙尚香'];

// 动态将士武器槽位：基础兵种 + 已解锁英雄（save.unlockedChars 含该人名的全部字符）
export function unitSlotNames(save) {
  const base = UNIT_SLOTS.slice();
  const heroes = HERO_NAMES.filter((name) => {
    const chars = Array.from(name);
    return chars.every((ch) => save.unlockedChars.includes(ch));
  });
  return base.concat(heroes);
}

// 套装：同名多件触发羁绊（2 件 / 3 件）
export const SERIES = {
  '虎啸': {
    name: '虎啸', color: '#e0704a',
    bonds: { 2: { atk: 0.08 }, 3: { atk: 0.15, spd: 0.08 } },
  },
  '龙腾': {
    name: '龙腾', color: '#4a8ae0',
    bonds: { 2: { lordHp: 2 }, 3: { lordHp: 4, blockerHp: 0.20 } },
  },
  '凤仪': {
    name: '凤仪', color: '#c98ab8',
    bonds: { 2: { coin: 0.15 }, 3: { coin: 0.25, stunDuration: 0.30 } },
  },
};

export const EQUIP = {
  // 玩家装备：作用于全军/主公（p_drum 独立散件，无套装）
  p_sword: { id: 'p_sword', name: '统帅之剑', kind: 'player', slot: '武器', series: '虎啸', stat: { atk: 0.08 }, statText: '全体攻击' },
  p_armor: { id: 'p_armor', name: '主公铠甲', kind: 'player', slot: '护甲', series: '虎啸', stat: { lordHp: 3 }, statText: '主公生命' },
  p_charm: { id: 'p_charm', name: '聚宝符',   kind: 'player', slot: '饰品', series: '虎啸', stat: { coin: 0.15 }, statText: '金币收益' },
  p_drum:  { id: 'p_drum',  name: '进军战鼓', kind: 'player', slot: '饰品', stat: { spd: 0.08 }, statText: '全体攻速' },
  // 龙腾套装
  p_dragonWeapon:   { id: 'p_dragonWeapon',   name: '青龙戟', kind: 'player', slot: '武器', series: '龙腾', stat: { atk: 0.10 }, statText: '全体攻击' },
  p_dragonArmor:    { id: 'p_dragonArmor',    name: '龙鳞甲', kind: 'player', slot: '护甲', series: '龙腾', stat: { lordHp: 3 }, statText: '主公生命' },
  p_dragonTrinket:  { id: 'p_dragonTrinket',  name: '龙珠',   kind: 'player', slot: '饰品', series: '龙腾', stat: { coin: 0.12 }, statText: '金币收益' },
  // 凤仪套装
  p_phoenixWeapon:  { id: 'p_phoenixWeapon',  name: '凤翎扇', kind: 'player', slot: '武器', series: '凤仪', stat: { spd: 0.08 }, statText: '全体攻速' },
  p_phoenixArmor:   { id: 'p_phoenixArmor',   name: '锦凤袍', kind: 'player', slot: '护甲', series: '凤仪', stat: { lordHp: 2 }, statText: '主公生命' },
  p_phoenixTrinket: { id: 'p_phoenixTrinket', name: '凤钗',   kind: 'player', slot: '饰品', series: '凤仪', stat: { coin: 0.10 }, statText: '金币收益' },
  // 将士武器：佩戴到兵种槽，作用于该兵种所有将士
  u_blade: { id: 'u_blade', name: '环首刀', kind: 'unit', stat: { atk: 0.12 }, statText: '攻击' },
  u_spear: { id: 'u_spear', name: '亮银枪', kind: 'unit', stat: { atk: 0.06, spd: 0.06 }, statText: '攻击/攻速' },
  u_bow:   { id: 'u_bow',   name: '穿云弓', kind: 'unit', stat: { range: 0.12 }, statText: '射程' },
  u_dart:  { id: 'u_dart',  name: '流星锤', kind: 'unit', stat: { crit: 0.10 }, statText: '暴击率' },
};

export const rarityById = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];

// 附加词条池与稀有度档位（洗练/掉落重随）
export const AFFIX_POOL = ['atk', 'spd', 'crit', 'range', 'coin', 'lordHp'];
export const AFFIX_BOUNDS = {
  common: { count: 1, min: 0.02, max: 0.05 },
  fine:   { count: 1, min: 0.03, max: 0.07 },
  rare:   { count: 2, min: 0.04, max: 0.09 },
  epic:   { count: 3, min: 0.05, max: 0.12 },
};

export function rollAffixes(rarity, random = Math.random) {
  const cfg = AFFIX_BOUNDS[rarity] || AFFIX_BOUNDS.common;
  const count = cfg.count;
  const affixes = [];
  for (let i = 0; i < count; i++) {
    const key = AFFIX_POOL[Math.floor(random() * AFFIX_POOL.length)];
    const value = cfg.min + (cfg.max - cfg.min) * random();
    affixes.push({ key, value: Number(value.toFixed(4)) });
  }
  return affixes;
}

export function rollEquipInstance(id, rarity, random = Math.random) {
  return { id, rarity, lvl: 1, affixes: rollAffixes(rarity, random) };
}

// 单件装备的实际数值（稀有度倍率 × 等级成长 + 附加词条）
export function equipStats(inst) {
  const def = EQUIP[inst.id];
  const mul = rarityById(inst.rarity).mul * (1 + 0.08 * (inst.lvl - 1));
  const out = {};
  for (const k in def.stat) out[k] = def.stat[k] * mul;
  for (const affix of inst.affixes || []) {
    out[affix.key] = (out[affix.key] || 0) + affix.value;
  }
  return out;
}

// 展示用文本，如「全体攻击 +18%」「主公生命 +7」
export function equipStatText(inst) {
  const def = EQUIP[inst.id];
  const s = equipStats(inst);
  const parts = [];
  for (const k in s) {
    const label = { atk: '全体攻击', spd: '全体攻速', coin: '金币收益', lordHp: '主公生命', range: '射程', crit: '暴击率' }[k] || k;
    parts.push(k === 'lordHp' ? label + ' +' + Math.round(s[k]) : label + ' +' + Math.round(s[k] * 100) + '%');
  }
  return def.name + '·' + rarityById(inst.rarity).name + ' Lv' + inst.lvl + '：' + parts.join(' ');
}

// 击杀掉落概率（随波次与难度提升）
export function dropChance(wave, dropMul) {
  return Math.min(0.06, 0.004 * (1 + wave * 0.1) * dropMul);
}

// 稀有度抽取：高波次/高难度提高高档权重
export function rollRarity(wave, dropMul) {
  const boost = (1 + wave * 0.06) * dropMul;
  const weights = RARITIES.map((r, i) => (i === 0 ? r.weight : r.weight * boost));
  let total = 0;
  for (const w of weights) total += w;
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return RARITIES[i].id;
  }
  return 'common';
}

export function rollEquipId() {
  const ids = Object.keys(EQUIP);
  return ids[Math.floor(Math.random() * ids.length)];
}

// 套装羁绊聚合：按玩家槽位统计各套装件数，返回已触发的羁绊加成
// （≥2 件触发 2 件套，≥3 件触发 3 件套并覆盖 2 件套）
export function bondStats(slotMap, ownedList) {
  const counts = {};
  for (const slot of PLAYER_SLOTS) {
    const uid = slotMap && slotMap[slot];
    if (uid == null) continue;
    const inst = (ownedList || []).find((e) => e.uid === uid);
    const series = inst && EQUIP[inst.id] && EQUIP[inst.id].series;
    if (series) counts[series] = (counts[series] || 0) + 1;
  }
  const out = {};
  for (const [series, count] of Object.entries(counts)) {
    const bond = SERIES[series] && SERIES[series].bonds[count >= 3 ? 3 : count === 2 ? 2 : 0];
    if (!bond) continue;
    for (const [k, v] of Object.entries(bond)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
