// 将士配置：基础兵种 + 进阶字 + 成长曲线
// range/aoe 单位为格；interval 为攻击间隔秒

export const BASE_UNITS = {
  '兵': { char: '兵', range: 1.4, atk: 10, interval: 1.0, atkType: 'single', color: '#c9a86a', desc: '近程单体' },
  '骑': { char: '骑', range: 1.9, atk: 9,  interval: 1.1, atkType: 'circle', aoe: 1.0, color: '#b8763e', desc: '圆形范围' },
  '枪': { char: '枪', range: 2.2, atk: 12, interval: 1.2, atkType: 'line',   color: '#9fb4c7', desc: '直线穿透' },
  '弓': { char: '弓', range: 3.6, atk: 14, interval: 1.0, atkType: 'single', color: '#8fae6b', desc: '远程单体' },
  '炮': { char: '炮', range: 3.0, atk: 18, interval: 2.0, atkType: 'aoe', aoe: 1.2, color: '#b05a4e', desc: '远程范围' },
};

// 进阶字：单独放置不生效，用于组词（前缀强化或人名）
export const ADV_CHARS = {
  '精': { color: '#e8c35a' }, '铁': { color: '#a8a8b8' }, '神': { color: '#e8c35a' },
  '烈': { color: '#e0704a' }, '谋': { color: '#7fc7c0' },
  '赵': { color: '#e8c35a' }, '云': { color: '#e8c35a' },
  '吕': { color: '#e8c35a' }, '布': { color: '#e8c35a' },
  '诸': { color: '#e8c35a' }, '葛': { color: '#e8c35a' }, '亮': { color: '#e8c35a' },
  '关': { color: '#e8c35a' }, '羽': { color: '#e8c35a' },
  '张': { color: '#e8c35a' }, '飞': { color: '#e8c35a' },
  '曹': { color: '#e8c35a' }, '操': { color: '#e8c35a' },
  '周': { color: '#e8c35a' }, '瑜': { color: '#e8c35a' },
  '马': { color: '#e8c35a' }, '超': { color: '#e8c35a' },
  '黄': { color: '#e8c35a' }, '忠': { color: '#e8c35a' },
  '貂': { color: '#e8c35a' }, '蝉': { color: '#e8c35a' },
  '孙': { color: '#e8c35a' }, '尚': { color: '#e8c35a' }, '香': { color: '#e8c35a' },
};

// 刷新池中基础兵种权重
export const BASE_WEIGHTS = { '兵': 30, '骑': 20, '枪': 20, '弓': 18, '炮': 12 };

// 道路阻挡数值：生命、容量与敌军攻击统一在此调整
export const BLOCKING = {
  baseHp: 140,
  tierHpMul: 1.7,
  levelHpStep: 0.12,
  maxCapacity: 4,
  interceptToleranceCells: 0.35,
  attackInterval: 1,
  enemyDamageRate: 0.025,
  minEnemyDamage: 4,
};

// 阶数曲线：攻击力倍率 / 攻速倍率（interval 乘数）
export const tierAtkMul = (tier) => Math.pow(1.6, tier - 1);
export const tierIntervalMul = (tier) => Math.pow(0.9, tier - 1);

// 等级曲线
export const levelAtkMul = (level) => 1 + 0.08 * (level - 1);
export const levelIntervalMul = (level) => Math.max(0.6, 1 - 0.03 * (level - 1));

// 升级所需经验
export const xpForLevel = (level) => level * 10;
