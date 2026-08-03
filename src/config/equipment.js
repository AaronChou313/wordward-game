// 装备系统：玩家装备（3 槽）+ 将士武器（按兵种佩戴），稀有度 4 档，重复掉落自动合成升级
export const RARITIES = [
  { id: 'common', name: '普通', color: '#b8b8b8', mul: 1, weight: 60 },
  { id: 'fine',   name: '精良', color: '#6aa8e0', mul: 1.5, weight: 28 },
  { id: 'rare',   name: '稀有', color: '#b07ae0', mul: 2.2, weight: 10 },
  { id: 'epic',   name: '传说', color: '#e0a03a', mul: 3.2, weight: 2 },
];

export const PLAYER_SLOTS = ['武器', '护甲', '饰品'];
export const UNIT_SLOTS = ['兵', '骑', '枪', '弓', '炮'];

export const EQUIP = {
  // 玩家装备：作用于全军/主公
  p_sword: { id: 'p_sword', name: '统帅之剑', kind: 'player', slot: '武器', stat: { atk: 0.08 }, statText: '全体攻击' },
  p_armor: { id: 'p_armor', name: '主公铠甲', kind: 'player', slot: '护甲', stat: { lordHp: 3 }, statText: '主公生命' },
  p_charm: { id: 'p_charm', name: '聚宝符',   kind: 'player', slot: '饰品', stat: { coin: 0.15 }, statText: '金币收益' },
  p_drum:  { id: 'p_drum',  name: '进军战鼓', kind: 'player', slot: '饰品', stat: { spd: 0.08 }, statText: '全体攻速' },
  // 将士武器：佩戴到兵种槽，作用于该兵种所有将士
  u_blade: { id: 'u_blade', name: '环首刀', kind: 'unit', stat: { atk: 0.12 }, statText: '攻击' },
  u_spear: { id: 'u_spear', name: '亮银枪', kind: 'unit', stat: { atk: 0.06, spd: 0.06 }, statText: '攻击/攻速' },
  u_bow:   { id: 'u_bow',   name: '穿云弓', kind: 'unit', stat: { range: 0.12 }, statText: '射程' },
  u_dart:  { id: 'u_dart',  name: '流星锤', kind: 'unit', stat: { crit: 0.10 }, statText: '暴击率' },
};

export const rarityById = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];

// 单件装备的实际数值（稀有度倍率 × 等级成长）
export function equipStats(inst) {
  const def = EQUIP[inst.id];
  const mul = rarityById(inst.rarity).mul * (1 + 0.08 * (inst.lvl - 1));
  const out = {};
  for (const k in def.stat) out[k] = def.stat[k] * mul;
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
