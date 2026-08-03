// 词组配置：前缀强化词 + 典故人名词（参考王者荣耀三国英雄）
// 前缀字与基础兵种横竖相邻即生效，断开失效
export const PREFIX_BUFFS = {
  '精': { atkSpeed: 0.4,  label: '精·攻速+40%' },
  '铁': { range: 0.5,     label: '铁·射程+50%' },
  '神': { crit: 0.35, critMul: 2.0, label: '神·35%暴击' },
  '烈': { damage: 0.5, aoe: 0.3, label: '烈·伤害+50%' },
  '谋': { slowAura: 0.25, label: '谋·减速光环' },
};

// 人名词：相邻拼出名字后融合为英雄单位
export const HEROES = {
  '赵云':   { atk: 26, interval: 0.45, range: 2.2, atkType: 'single', skill: 'multistab', color: '#7ec8e3', desc: '龙胆：高频连刺' },
  '吕布':   { atk: 46, interval: 1.2,  range: 2.4, atkType: 'circle', aoe: 1.7, skill: 'sweep', color: '#e05a4a', desc: '无双：大范围横扫' },
  '诸葛亮': { atk: 14, interval: 2.2,  range: 99,  atkType: 'chain', skill: 'thunder', color: '#c9a8ff', desc: '雷霆：全屏落雷' },
  '关羽':   { atk: 34, interval: 0.9,  range: 2.0, atkType: 'line', skill: 'crescent', color: '#5aa86a', desc: '青龙偃月：直线重斩' },
  '张飞':   { atk: 30, interval: 1.0,  range: 1.8, atkType: 'circle', aoe: 1.4, skill: 'roar', color: '#c78a4a', desc: '咆哮：范围震慑' },
  '曹操':   { atk: 22, interval: 0.8,  range: 2.6, atkType: 'single', skill: 'command', color: '#d8b45a', desc: '号令：周围将士攻速+15%' },
  '周瑜':   { atk: 24, interval: 1.4,  range: 3.2, atkType: 'aoe', aoe: 1.5, skill: 'fire', color: '#e07840', desc: '火烧连营' },
  '马超':   { atk: 28, interval: 0.6,  range: 2.0, atkType: 'line', skill: 'charge', color: '#b8c8d8', desc: '铁骑冲锋' },
  '黄忠':   { atk: 40, interval: 1.6,  range: 4.5, atkType: 'single', skill: 'snipe', color: '#a8b86a', desc: '百步穿杨' },
  '貂蝉':   { atk: 10, interval: 1.5,  range: 2.5, atkType: 'circle', aoe: 2.0, skill: 'charm', color: '#e8a0c0', desc: '魅惑：范围减速50%' },
  '孙尚香': { atk: 32, interval: 1.0,  range: 3.5, atkType: 'aoe', aoe: 1.0, skill: 'barrage', color: '#e08a6a', desc: '炮火齐射' },
};

// 字 → 可组成的人名（供刷新池/提示用）
export const HERO_NAMES = Object.keys(HEROES);
