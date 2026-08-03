// 道具配置：主动/被动，价格与升级曲线
export const MAX_ACTIVE = 3;
export const MAX_PASSIVE = 6;

export const ITEMS = {
  fire: {
    id: 'fire', name: '烈火符', kind: 'active', price: 200,
    desc: '全屏火焰伤害', cooldown: 20,
    effect: (lvl) => ({ damage: 80 + 40 * (lvl - 1) }),
    descAt: (lvl) => `全屏造成 ${80 + 40 * (lvl - 1)} 点伤害`,
  },
  recruit: {
    id: 'recruit', name: '募兵令', kind: 'active', price: 150,
    desc: '立即刷新将士栏', cooldown: 45,
    effect: () => ({}),
    descAt: () => '立即重置并刷新将士栏',
  },
  train: {
    id: 'train', name: '练兵符', kind: 'active', price: 220,
    desc: '拖拽使用：将士升 1 阶', targeted: true,
    cooldownAt: (lvl) => Math.max(30, 60 - 5 * (lvl - 1)),
    effect: () => ({}),
    descAt: (lvl) => `拖到将士身上直接升 1 阶（冷却 ${Math.max(30, 60 - 5 * (lvl - 1))}s）`,
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
};

export const upgradeCost = (itemId, curLevel) => Math.round(ITEMS[itemId].price * 0.6 * curLevel);
export const sellPrice = (itemId, level) => {
  let total = ITEMS[itemId].price;
  for (let l = 1; l < level; l++) total += upgradeCost(itemId, l);
  return Math.round(total * 0.5);
};
