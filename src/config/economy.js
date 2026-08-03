// 经济系统：刷新冷却、击杀加速、铲子、金币换算、抽奖
export const REFRESH_BASE_CD = 30;   // 初始冷却秒
export const REFRESH_CD_STEP = 5;    // 每刷新一次 +5s
export const KILL_CD_REDUCE = 0.5;   // 击杀一只怪 -0.5s 剩余冷却
export const REFRESH_SLOTS = 5;
export const SHOVEL_DROP_CHANCE = 0.45;
export const SHOVEL_PITY = 3;        // 连续 N 次刷新未掉铲子则必掉

// 结算金币
export const coinsFor = (wave, kills) => wave * 10 + kills;

// 抽奖
export const GACHA_COST = 100;
export const GACHA_CHAR_WEIGHT = 0.6;  // 抽出进阶字的概率，其余出道具

// 商城直接购买进阶字（随机未解锁）
export const SHOP_CHAR_COST = 150;

// 出售返还比例
export const SELL_RATIO = 0.5;
