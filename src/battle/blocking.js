import { BLOCKING } from '../config/units.js';

export function blockStats(tier, level) {
  return {
    maxHp: Math.round(BLOCKING.baseHp
      * BLOCKING.tierHpMul ** (tier - 1)
      * (1 + BLOCKING.levelHpStep * (level - 1))),
    capacity: Math.min(BLOCKING.maxCapacity, 1 + Math.floor((tier - 1) / 2)),
  };
}

export function blockDamage(enemy) {
  return Math.max(BLOCKING.minEnemyDamage, Math.round(enemy.maxHp * BLOCKING.enemyDamageRate));
}

export function assignBlockers(infantry, enemies) {
  const active = infantry.filter((tower) => tower.blocking && !tower.dead);
  const eligible = enemies
    .filter((enemy) => !enemy.dead && !enemy.reached)
    .sort((a, b) => b.progress - a.progress);
  const assignments = new Map();
  let next = 0;

  for (const tower of active) {
    const assigned = eligible.slice(next, next + tower.blockCapacity);
    assignments.set(tower, assigned);
    next += assigned.length;
  }

  const assignedEnemies = new Set();
  for (const tower of active) {
    tower.blockedEnemies = assignments.get(tower);
    for (const enemy of tower.blockedEnemies) {
      assignedEnemies.add(enemy);
      if (enemy.setBlocker) enemy.setBlocker(tower);
      else enemy.blocker = tower;
    }
  }

  for (const tower of infantry) {
    if (!assignments.has(tower)) tower.blockedEnemies = [];
  }
  for (const enemy of enemies) {
    if (!assignedEnemies.has(enemy) && enemy.blocker) {
      if (enemy.releaseFromBlocker) enemy.releaseFromBlocker();
      else enemy.blocker = null;
    }
  }

  return assignments;
}
