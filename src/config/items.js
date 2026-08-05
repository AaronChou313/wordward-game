// 道具配置：主动/被动，价格与升级曲线
export const MAX_ACTIVE = 3;
export const MAX_PASSIVE = 6;

export const ITEMS = {
  fire: {
    id: 'fire', name: '烈火符', kind: 'active', price: 200,
    desc: '点击施放全屏火焰伤害', castMode: 'instant',
    cooldownAt: () => 20,
    effect: { type: 'damage-all', damageAt: (lvl) => 80 + 40 * (lvl - 1) },
    descAt: (lvl) => `点击施放：全屏造成 ${80 + 40 * (lvl - 1)} 点伤害（冷却 20s）`,
  },
  recruit: {
    id: 'recruit', name: '募兵令', kind: 'active', price: 150,
    desc: '点击紧急刷新整个将士栏', castMode: 'instant',
    cooldownAt: () => 45,
    effect: { type: 'refresh-bar' },
    descAt: () => '点击施放：立即重置并刷新将士栏（冷却 45s）',
  },
  train: {
    id: 'train', name: '练兵符', kind: 'active', price: 220,
    desc: '拖到将士：定向提升 1 阶', castMode: 'target',
    cooldownAt: (lvl) => Math.max(30, 60 - 5 * (lvl - 1)),
    effect: { type: 'promote-target', tiers: 1 },
    descAt: (lvl) => `拖到将士身上直接升 1 阶（冷却 ${Math.max(30, 60 - 5 * (lvl - 1))}s）`,
  },
  reinforce: {
    id: 'reinforce', name: '援军令', kind: 'active', price: 190,
    desc: '点击补满将士栏的空位', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(20, 35 - 2 * (lvl - 1)),
    effect: { type: 'fill-empty-bar' },
    descAt: (lvl) => `点击施放：只补充空栏位（冷却 ${Math.max(20, 35 - 2 * (lvl - 1))}s）`,
  },
  warDrum: {
    id: 'warDrum', name: '止战鼓', kind: 'active', price: 260,
    desc: '点击使全场敌军短暂减速', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(30, 50 - 3 * (lvl - 1)),
    effect: {
      type: 'slow-all',
      durationAt: (lvl) => 4 + 0.5 * (lvl - 1),
      factorAt: (lvl) => Math.max(0.3, 0.5 - 0.03 * (lvl - 1)),
    },
    descAt: (lvl) => `点击施放：全场减速 ${4 + 0.5 * (lvl - 1)}s（冷却 ${Math.max(30, 50 - 3 * (lvl - 1))}s）`,
  },
  power: {
    id: 'power', name: '武力卷轴', kind: 'passive', price: 180,
    desc: '全体攻击提升', buffs: (lvl) => ({ atk: 0.15 + 0.05 * (lvl - 1) }),
    descAt: (lvl) => `全体攻击 +${Math.round((0.15 + 0.05 * (lvl - 1)) * 100)}%`,
  },
  swift: {
    id: 'swift', name: '疾风靴', kind: 'passive', price: 160,
    desc: '全体攻速提升', buffs: (lvl) => ({ spd: 0.10 + 0.04 * (lvl - 1) }),
    descAt: (lvl) => `全体攻速 +${Math.round((0.10 + 0.04 * (lvl - 1)) * 100)}%`,
  },
  goldpot: {
    id: 'goldpot', name: '聚宝盆', kind: 'passive', price: 150,
    desc: '金币获取提升', buffs: (lvl) => ({ coin: 0.2 + 0.1 * (lvl - 1) }),
    descAt: (lvl) => `金币获取 +${Math.round((0.2 + 0.1 * (lvl - 1)) * 100)}%`,
  },
  fortification: {
    id: 'fortification', name: '工事图', kind: 'passive', price: 240,
    desc: '阻挡兵生命与容量提升',
    buffs: (lvl) => ({ blockerHp: 0.25 + 0.08 * (lvl - 1), blockerCapacity: 1 + Math.floor((lvl - 1) / 3) }),
    descAt: (lvl) => `阻挡兵生命 +${Math.round((0.25 + 0.08 * (lvl - 1)) * 100)}%，容量 +${1 + Math.floor((lvl - 1) / 3)}`,
  },
  bossBane: {
    id: 'bossBane', name: '破阵旗', kind: 'passive', price: 280,
    desc: '对 Boss 造成额外伤害',
    buffs: (lvl) => ({ bossDamage: 0.25 + 0.08 * (lvl - 1) }),
    descAt: (lvl) => `对 Boss 伤害 +${Math.round((0.25 + 0.08 * (lvl - 1)) * 100)}%`,
  },
  resolute: {
    id: 'resolute', name: '定军心', kind: 'passive', price: 230,
    desc: '缩短敌军技能造成的眩晕',
    buffs: (lvl) => ({ stunDuration: Math.min(0.6, 0.2 + 0.06 * (lvl - 1)) }),
    descAt: (lvl) => `眩晕持续时间 -${Math.round(Math.min(0.6, 0.2 + 0.06 * (lvl - 1)) * 100)}%`,
  },
  frost: {
    id: 'frost', name: '冰霜符', kind: 'active', price: 240,
    desc: '点击使全场敌军减速', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(30, 50 - 3 * (lvl - 1)),
    effect: { type: 'slow-all', durationAt: (lvl) => 5 + 0.5 * (lvl - 1), factorAt: (lvl) => Math.max(0.35, 0.5 - 0.03 * (lvl - 1)) },
    descAt: (lvl) => `点击施放：全场减速 ${5 + 0.5 * (lvl - 1)}s（冷却 ${Math.max(30, 50 - 3 * (lvl - 1))}s）`,
  },
  thunder: {
    id: 'thunder', name: '雷击符', kind: 'active', price: 260,
    desc: '点击对最强敌军造成单体高伤', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(25, 40 - 3 * (lvl - 1)),
    effect: { type: 'damage-strongest', damageAt: (lvl) => 220 + 80 * (lvl - 1) },
    descAt: (lvl) => `点击施放：对当前最强敌军造成 ${220 + 80 * (lvl - 1)} 点伤害（冷却 ${Math.max(25, 40 - 3 * (lvl - 1))}s）`,
  },
  heal: {
    id: 'heal', name: '治疗符', kind: 'active', price: 200,
    desc: '点击回复主公生命', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(20, 35 - 3 * (lvl - 1)),
    effect: { type: 'heal-lord', healAt: (lvl) => 2 + 1 * (lvl - 1) },
    descAt: (lvl) => `点击施放：主公回复 ${2 + 1 * (lvl - 1)} 点生命（冷却 ${Math.max(20, 35 - 3 * (lvl - 1))}s）`,
  },
  summon: {
    id: 'summon', name: '召唤符', kind: 'active', price: 230,
    desc: '点击立即召唤一名随机基础将士', castMode: 'instant',
    cooldownAt: (lvl) => Math.max(30, 45 - 3 * (lvl - 1)),
    effect: { type: 'summon-random' },
    descAt: (lvl) => `点击施放：立即召唤一名随机基础将士（冷却 ${Math.max(30, 45 - 3 * (lvl - 1))}s）`,
  },
  critFlag: {
    id: 'critFlag', name: '锋刃旗', kind: 'passive', price: 200,
    desc: '全体暴击率提升', buffs: (lvl) => ({ crit: 0.08 + 0.03 * (lvl - 1) }),
    descAt: (lvl) => `全体暴击率 +${Math.round((0.08 + 0.03 * (lvl - 1)) * 100)}%`,
  },
  rapidFlag: {
    id: 'rapidFlag', name: '连弩旗', kind: 'passive', price: 180,
    desc: '全体攻速提升', buffs: (lvl) => ({ spd: 0.08 + 0.03 * (lvl - 1) }),
    descAt: (lvl) => `全体攻速 +${Math.round((0.08 + 0.03 * (lvl - 1)) * 100)}%`,
  },
  granary: {
    id: 'granary', name: '粮草车', kind: 'passive', price: 190,
    desc: '战斗金币获取提升', buffs: (lvl) => ({ coin: 0.15 + 0.06 * (lvl - 1) }),
    descAt: (lvl) => `战斗金币 +${Math.round((0.15 + 0.06 * (lvl - 1)) * 100)}%`,
  },
  ironwall: {
    id: 'ironwall', name: '铁壁旗', kind: 'passive', price: 230,
    desc: '阻挡兵受到的伤害降低', buffs: (lvl) => ({ blockerDamageReduction: Math.min(0.5, 0.15 + 0.05 * (lvl - 1)) }),
    descAt: (lvl) => `阻挡兵受到的伤害 -${Math.round(Math.min(0.5, 0.15 + 0.05 * (lvl - 1)) * 100)}%`,
  },
};

export const upgradeCost = (itemId, curLevel) => Math.round(ITEMS[itemId].price * 0.6 * curLevel);
export const sellPrice = (itemId, level) => {
  let total = ITEMS[itemId].price;
  for (let l = 1; l < level; l++) total += upgradeCost(itemId, l);
  return Math.round(total * 0.5);
};
