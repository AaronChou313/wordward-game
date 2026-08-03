import { BLOCKING } from '../config/units.js';
import { CELL, PATH } from '../config/map.js';
import { PATH_TOTAL } from './path.js';

const pathIndexByCell = new Map(PATH.map(([c, r], index) => [c + ',' + r, index]));
const interceptionTolerance = BLOCKING.interceptToleranceCells * CELL;

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
  const active = infantry
    .filter((tower) => tower.blocking && !tower.dead)
    .map((tower) => ({ tower, pathIndex: pathIndexByCell.get(tower.c + ',' + tower.r) }))
    .filter(({ pathIndex }) => pathIndex !== undefined)
    .sort((a, b) => a.pathIndex - b.pathIndex);
  const assignments = new Map(active.map(({ tower }) => [tower, []]));

  if (active.length === 0) {
    for (const tower of infantry) tower.blockedEnemies = [];
    for (const enemy of enemies) releaseEnemy(enemy);
    return assignments;
  }

  const eligible = enemies
    .filter((enemy) => !enemy.dead && !enemy.reached)
    .sort((a, b) => enemyDistance(b) - enemyDistance(a));
  const eligibleSet = new Set(eligible);
  const assignedEnemies = new Set();

  // Keep valid local ownership stable before filling open capacity.
  for (const { tower, pathIndex } of active) {
    const assigned = assignments.get(tower);
    for (const enemy of tower.blockedEnemies) {
      if (assigned.length >= tower.blockCapacity) break;
      if (!eligibleSet.has(enemy) || assignedEnemies.has(enemy)) continue;
      if (enemy.blocker && enemy.blocker !== tower) continue;
      if (!canIntercept(enemy, pathIndex)) continue;
      assigned.push(enemy);
      assignedEnemies.add(enemy);
    }
  }

  for (const { tower, pathIndex } of active) {
    const assigned = assignments.get(tower);
    for (const enemy of eligible) {
      if (assigned.length >= tower.blockCapacity) break;
      if (assignedEnemies.has(enemy) || !canIntercept(enemy, pathIndex)) continue;
      assigned.push(enemy);
      assignedEnemies.add(enemy);
    }
  }

  for (const { tower } of active) {
    tower.blockedEnemies = assignments.get(tower);
    for (const enemy of tower.blockedEnemies) {
      if (enemy.setBlocker) enemy.setBlocker(tower);
      else enemy.blocker = tower;
    }
  }

  for (const tower of infantry) {
    if (!assignments.has(tower)) tower.blockedEnemies = [];
  }
  for (const enemy of enemies) {
    if (!assignedEnemies.has(enemy)) releaseEnemy(enemy);
  }

  return assignments;
}

function canIntercept(enemy, pathIndex) {
  const blockerDistance = pathIndex * CELL;
  const distance = enemyDistance(enemy);
  return distance >= blockerDistance - 1e-9
    && distance <= blockerDistance + interceptionTolerance + 1e-9;
}

function enemyDistance(enemy) {
  if (Number.isFinite(enemy.dist)) return enemy.dist;
  if (Number.isFinite(enemy.progress)) return enemy.progress * PATH_TOTAL;
  return -Infinity;
}

function releaseEnemy(enemy, expected = null) {
  if (!enemy.blocker) return false;
  if (enemy.releaseFromBlocker) return enemy.releaseFromBlocker(expected);
  if (expected && enemy.blocker !== expected) return false;
  enemy.blocker = null;
  return true;
}
