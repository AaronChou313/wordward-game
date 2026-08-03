import { DIFF_UNLOCK } from '../config/difficulty.js';

const MERIT_MULTIPLIERS = {
  easy: 1,
  normal: 2,
  hard: 4,
  endless: 8,
};

export function isBossWave(wave) {
  return Number.isInteger(wave) && wave > 0 && wave % 30 === 0;
}

export function isEliteWave(wave) {
  if (!Number.isInteger(wave) || wave <= 0) return false;
  const cycleWave = wave % 30;
  return cycleWave === 10 || cycleWave === 20;
}

export function meritForBoss(diffId, wave) {
  if (!isBossWave(wave)) return 0;
  return (MERIT_MULTIPLIERS[diffId] || 0) * (wave / 30);
}

export function claimKey(diffId, wave) {
  return diffId + ':' + wave;
}

export function nextDifficulty(diffId) {
  const unlock = DIFF_UNLOCK.find((entry) => entry.need.id === diffId);
  return unlock ? unlock.id : null;
}

export function canUnlockDifficulty(save, diffId) {
  const unlock = DIFF_UNLOCK.find((entry) => entry.id === diffId);
  if (!unlock) return false;
  return Boolean(save.merit.claimed[claimKey(unlock.need.id, unlock.need.bossWave)]);
}

export function claimBossCompletion(save, diffId, wave) {
  if (!isBossWave(wave)) return { claimed: false, merit: 0, unlocked: null };

  const key = claimKey(diffId, wave);
  if (save.merit.claimed[key]) return { claimed: false, merit: 0, unlocked: null };

  const merit = meritForBoss(diffId, wave);
  save.merit.claimed[key] = true;
  save.merit.total += merit;

  const unlocked = nextDifficulty(diffId);
  if (unlocked && canUnlockDifficulty(save, unlocked) && !save.diff.unlocked.includes(unlocked)) {
    save.diff.unlocked.push(unlocked);
    return { claimed: true, merit, unlocked };
  }

  return { claimed: true, merit, unlocked: null };
}
