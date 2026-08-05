export const GACHA_RATES = Object.freeze({
  common: 0.72,
  rare: 0.23,
  precious: 0.05,
});

export function effectiveGachaRates(pity) {
  if (pity.bigPity >= 49) return { common: 0, rare: 0, precious: 1 };
  if (pity.smallPity >= 9) return { common: 0, rare: 0.95, precious: 0.05 };
  return { ...GACHA_RATES };
}

export const GACHA_REWARDS = Object.freeze({
  common: Object.freeze([
    Object.freeze({ id: 'common-gold', kind: 'gold', label: '军饷 60 金', weight: 75, amount: 60 }),
    Object.freeze({ id: 'common-gold-large', kind: 'gold', label: '军饷 120 金', weight: 25, amount: 120 }),
  ]),
  rare: Object.freeze([
    Object.freeze({ id: 'rare-character', kind: 'character', label: '进阶字（全池）', weight: 35, selection: 'any', duplicateAmount: 120 }),
    Object.freeze({ id: 'rare-item', kind: 'item', label: '战术道具 +1 级', weight: 25, levels: 1 }),
    Object.freeze({ id: 'rare-gold', kind: 'gold', label: '军饷 200 金', weight: 20, amount: 200 }),
    Object.freeze({ id: 'rare-gems', kind: 'gems', label: '宝石 25', weight: 20, amount: 25 }),
  ]),
  precious: Object.freeze([
    Object.freeze({ id: 'precious-character', kind: 'character', label: '进阶字（未解锁优先）', weight: 35, selection: 'locked-first', duplicateAmount: 400 }),
    Object.freeze({ id: 'precious-item', kind: 'item', label: '珍贵道具 +2 级', weight: 25, levels: 2 }),
    Object.freeze({ id: 'precious-gold', kind: 'gold', label: '军饷 600 金', weight: 15, amount: 600 }),
    Object.freeze({ id: 'precious-gems', kind: 'gems', label: '宝石 60', weight: 15, amount: 60 }),
    Object.freeze({ id: 'precious-soul', kind: 'soulJade', label: '魂玉 1', weight: 10, amount: 1 }),
  ]),
});

export function rewardChance(rarity, reward, rates = GACHA_RATES) {
  const rewards = GACHA_REWARDS[rarity];
  const totalWeight = rewards.reduce((sum, entry) => sum + entry.weight, 0);
  return rates[rarity] * reward.weight / totalWeight;
}
