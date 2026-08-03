// 波次与成长曲线（按难度参数化）
import { DIFFICULTIES } from './difficulty.js';

export const LORD_HP = 20;
export const WAVE_REST = 10;         // 波次间隔秒
export const FIRST_WAVE_DELAY = 10;  // 开局准备时间秒

export function waveConfig(n, diff) {
  const d = diff || DIFFICULTIES[0];
  return {
    count: d.countBase + n * d.countGrow,
    hp: Math.round(28 * Math.pow(d.hpGrow, n) * d.hpMul),
    speed: Math.min(1.6, d.speedBase + n * d.speedGrow),   // 格/秒
    spawnInterval: Math.max(0.35, d.intervalBase - n * 0.03),
    reward: 1 + Math.floor(n / 3),
  };
}

// 进阶字出现概率随波次爬坡（高难度有加成）
export function advCharChance(wave, diff) {
  const add = diff ? diff.advAdd : 0;
  return Math.min(0.06 + wave * 0.02 + add, 0.7);
}
