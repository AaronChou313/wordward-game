import { effectiveGachaRates, GACHA_REWARDS } from '../config/gacha.js';
import { ITEMS } from '../config/items.js';
import { ADV_CHARS } from '../config/units.js';

function rollRarity(random, rates) {
  const roll = random();
  if (roll < rates.common) return 'common';
  if (roll < rates.common + rates.rare) return 'rare';
  return 'precious';
}

function pickWeighted(rewards, random) {
  const totalWeight = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  const roll = random() * totalWeight;
  let cursor = 0;
  for (const reward of rewards) {
    cursor += reward.weight;
    if (roll < cursor) return reward;
  }
  return rewards[rewards.length - 1];
}

function finishResult(save, result) {
  save.gacha.history.unshift({ rarity: result.rarity, message: result.message });
  save.gacha.history = save.gacha.history.slice(0, 10);
  return result;
}

export function drawGacha(save, random = Math.random) {
  const rarity = rollRarity(random, effectiveGachaRates(save.gacha));

  if (rarity === 'precious') {
    save.gacha.smallPity = 0;
    save.gacha.bigPity = 0;
  } else {
    save.gacha.bigPity += 1;
    save.gacha.smallPity = rarity === 'rare' ? 0 : save.gacha.smallPity + 1;
  }

  const reward = pickWeighted(GACHA_REWARDS[rarity], random);
  if (reward.kind === 'gold') save.gold += reward.amount;

  if (reward.kind === 'character') {
    const characters = Object.keys(ADV_CHARS);
    const locked = characters.filter((character) => !save.unlockedChars.includes(character));
    const candidates = reward.selection === 'locked-first' && locked.length > 0 ? locked : characters;
    const character = candidates[Math.floor(random() * candidates.length)];
    const converted = save.unlockedChars.includes(character);
    if (converted) {
      save.gold += reward.duplicateAmount;
    } else {
      save.unlockedChars.push(character);
    }
    return finishResult(save, {
      rarity,
      rewardId: reward.id,
      kind: reward.kind,
      character,
      converted,
      amount: converted ? reward.duplicateAmount : undefined,
      message: converted
        ? `进阶字「${character}」重复，转化为 ${reward.duplicateAmount} 金`
        : `获得进阶字「${character}」`,
    });
  }

  if (reward.kind === 'item') {
    const itemIds = Object.keys(ITEMS);
    const itemId = itemIds[Math.floor(random() * itemIds.length)];
    const previousLevel = save.items.owned[itemId] || 0;
    const level = previousLevel + reward.levels;
    save.items.owned[itemId] = level;
    for (const list of [save.items.equippedActive, save.items.equippedPassive]) {
      const equipped = list.find((entry) => entry.id === itemId);
      if (equipped) equipped.level = level;
    }
    return finishResult(save, {
      rarity,
      rewardId: reward.id,
      kind: reward.kind,
      itemId,
      level,
      upgraded: previousLevel > 0,
      message: previousLevel > 0
        ? `${ITEMS[itemId].name} 升至 Lv${level}`
        : `获得道具「${ITEMS[itemId].name}」Lv${level}`,
    });
  }

  return finishResult(save, {
    rarity,
    rewardId: reward.id,
    kind: reward.kind,
    amount: reward.amount,
    message: `获得军饷 ${reward.amount} 金`,
  });
}
