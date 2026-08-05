// 套装羁绊 → 战斗属性合并：将装备套装加成并入战斗统计对象
import { bondStats } from '../config/equipment.js';

// baseStats 为已有战斗加成（被动道具 + 玩家装备单件），此处叠加套装羁绊数值，
// 返回新对象，不修改入参。羁绊可含 atk/spd/lordHp/coin/blockerHp/stunDuration。
export function applyBondStats(baseStats, slotMap, ownedList) {
  const merged = { ...(baseStats || {}) };
  for (const [k, v] of Object.entries(bondStats(slotMap, ownedList))) {
    merged[k] = (merged[k] || 0) + v;
  }
  return merged;
}
