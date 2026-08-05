// 难度系统：简单/普通/困难 + 无尽层数（无限增长）
// 敌人：hpMul 基础血量倍率、hpGrow 每波血量增长、speedBase/speedGrow 移速、countBase/countGrow 数量、intervalBase 出兵间隔
// 收益：coinMul 金币倍率、shovelAdd 铲子掉率加成、advAdd 进阶字概率加成、dropMul 装备掉率倍率
export const DIFFICULTIES = [
  {
    id: 'easy', name: '简单',
    hpMul: 0.75, hpGrow: 1.20, countBase: 6, countGrow: 2,
    speedBase: 0.85, speedGrow: 0.018, intervalBase: 1.3,
    coinMul: 0.8, shovelAdd: 0.05, advAdd: 0, dropMul: 0.7,
  },
  {
    id: 'normal', name: '普通',
    hpMul: 1.0, hpGrow: 1.24, countBase: 8, countGrow: 2,
    speedBase: 0.9, speedGrow: 0.02, intervalBase: 1.2,
    coinMul: 1.0, shovelAdd: 0.05, advAdd: 0.03, dropMul: 1.0,
  },
  {
    id: 'hard', name: '困难',
    hpMul: 1.4, hpGrow: 1.28, countBase: 10, countGrow: 3,
    speedBase: 0.95, speedGrow: 0.025, intervalBase: 1.1,
    coinMul: 1.5, shovelAdd: 0.12, advAdd: 0.08, dropMul: 1.6,
  },
];

// 无尽模式：以困难为基底，每层敌人更强、收益更高，无限增长
export function endlessConfig(floor) {
  const h = DIFFICULTIES[2];
  const k = Math.max(0, floor - 1);
  return {
    id: 'endless', name: '无尽·' + floor + '层', floor,
    hpMul: h.hpMul * (1 + 0.25 * k),
    hpGrow: Math.min(1.42, h.hpGrow + 0.005 * k),
    countBase: h.countBase + 2 * k,
    countGrow: h.countGrow,
    speedBase: Math.min(1.2, h.speedBase + 0.02 * k),
    speedGrow: h.speedGrow,
    intervalBase: Math.max(0.7, h.intervalBase - 0.05 * k),
    coinMul: h.coinMul * (1 + 0.2 * k),
    shovelAdd: Math.min(0.3, h.shovelAdd + 0.03 * k),
    advAdd: Math.min(0.25, h.advAdd + 0.02 * k),
    dropMul: h.dropMul * (1 + 0.15 * k),
  };
}

// 解锁条件：领取指定难度第 30 波 Boss 的通关军功
export const DIFF_UNLOCK = [
  { id: 'normal', need: { id: 'easy', bossWave: 30 } },
  { id: 'hard', need: { id: 'normal', bossWave: 30 } },
  { id: 'endless', need: { id: 'hard', bossWave: 30 } },
];

// 无尽模式：达到该波次解锁下一层
export const ENDLESS_FLOOR_WAVE = 15;

// 根据存档的 selected 解析出实际难度配置
export function resolveDiff(selected) {
  if (selected && selected.id === 'endless') return endlessConfig(selected.floor || 1);
  const found = DIFFICULTIES.find((d) => selected && d.id === selected.id);
  return found || DIFFICULTIES[0];
}

// 玩家当前可选的难度列表（已解锁命名难度 + 无尽各层）
export function availableDiffs(diffSave) {
  const list = DIFFICULTIES.filter((d) => diffSave.unlocked.includes(d.id));
  if (diffSave.unlocked.includes('endless')) {
    for (let f = 1; f <= diffSave.endlessFloor; f++) list.push(endlessConfig(f));
  }
  return list;
}
