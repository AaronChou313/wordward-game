import { describe, expect, it } from 'vitest';

function makeSave(overrides = {}) {
  return {
    gold: 0,
    unlockedChars: [],
    items: { owned: {}, equippedActive: [], equippedPassive: [] },
    gacha: { smallPity: 0, bigPity: 0, history: [] },
    ...overrides,
  };
}

function sequenceRandom(...values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('gacha configuration', () => {
  it('publishes the exact rarity rates used by normal draws', async () => {
    const config = await import('../config/gacha.js');

    expect(config.GACHA_RATES).toEqual({
      common: 0.72,
      rare: 0.23,
      precious: 0.05,
    });
  });

  it('publishes weighted rewards for every displayed category and rarity', async () => {
    const { GACHA_REWARDS } = await import('../config/gacha.js');

    expect(Object.keys(GACHA_REWARDS)).toEqual(['common', 'rare', 'precious']);
    expect(GACHA_REWARDS.common.length).toBeGreaterThan(0);
    expect(GACHA_REWARDS.rare.length).toBeGreaterThan(0);
    expect(GACHA_REWARDS.precious.length).toBeGreaterThan(0);
    expect(GACHA_REWARDS.common.concat(GACHA_REWARDS.rare, GACHA_REWARDS.precious)
      .map((reward) => reward.kind)).toEqual(expect.arrayContaining([
      'gold',
      'character',
      'item',
    ]));
    expect(GACHA_REWARDS.common.concat(GACHA_REWARDS.rare, GACHA_REWARDS.precious)
      .map((reward) => reward.kind)).not.toContain('shards');
    expect(GACHA_REWARDS.common.concat(GACHA_REWARDS.rare, GACHA_REWARDS.precious)
      .every((reward) => reward.weight > 0 && reward.label)).toBe(true);
  });

  it('derives each displayed reward chance from the engine weights', async () => {
    const { GACHA_REWARDS, rewardChance } = await import('../config/gacha.js');

    const chances = Object.entries(GACHA_REWARDS).flatMap(([rarity, rewards]) => (
      rewards.map((reward) => rewardChance(rarity, reward))
    ));

    const expected = [0.54, 0.18, 0.1035, 0.0805, 0.046, 0.0225, 0.0175, 0.01];
    chances.forEach((chance, index) => expect(chance).toBeCloseTo(expected[index], 10));
    expect(chances.reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 10);
  });

  it('derives the next-draw rarity rates from the current pity state', async () => {
    const { effectiveGachaRates } = await import('../config/gacha.js');

    expect(effectiveGachaRates({ smallPity: 0, bigPity: 0 })).toEqual({
      common: 0.72,
      rare: 0.23,
      precious: 0.05,
    });
    expect(effectiveGachaRates({ smallPity: 9, bigPity: 20 })).toEqual({
      common: 0,
      rare: 0.95,
      precious: 0.05,
    });
    expect(effectiveGachaRates({ smallPity: 9, bigPity: 49 })).toEqual({
      common: 0,
      rare: 0,
      precious: 1,
    });
  });

  it('declares distinct rare and precious character and item strategies', async () => {
    const { GACHA_REWARDS } = await import('../config/gacha.js');
    const rareCharacter = GACHA_REWARDS.rare.find((reward) => reward.kind === 'character');
    const rareItem = GACHA_REWARDS.rare.find((reward) => reward.kind === 'item');
    const preciousCharacter = GACHA_REWARDS.precious.find((reward) => reward.kind === 'character');
    const preciousItem = GACHA_REWARDS.precious.find((reward) => reward.kind === 'item');

    expect(rareCharacter.selection).toBe('any');
    expect(rareItem.levels).toBe(1);
    expect(preciousCharacter.selection).toBe('locked-first');
    expect(preciousItem.levels).toBe(2);
  });
});

describe('drawGacha', () => {
  it('uses the published common, rare, and precious rarity boundaries', async () => {
    const { drawGacha } = await import('./gachaEngine.js');

    const common = drawGacha(makeSave(), sequenceRandom(0.719999, 0.99));
    const rare = drawGacha(makeSave(), sequenceRandom(0.72, 0.99));
    const precious = drawGacha(makeSave(), sequenceRandom(0.95, 0.99));

    expect([common.rarity, rare.rarity, precious.rarity]).toEqual([
      'common',
      'rare',
      'precious',
    ]);
  });

  it('promotes draw 10 to rare or better and resets only small pity', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const save = makeSave({ gacha: { smallPity: 9, bigPity: 9, history: [] } });

    const result = drawGacha(save, sequenceRandom(0, 0.99));

    expect(result.rarity).toBe('rare');
    expect(save.gacha.smallPity).toBe(0);
    expect(save.gacha.bigPity).toBe(10);
  });

  it('promotes draw 50 to precious and resets both pity counters', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const save = makeSave({ gacha: { smallPity: 4, bigPity: 49, history: [] } });

    const result = drawGacha(save, sequenceRandom(0, 0.99));

    expect(result.rarity).toBe('precious');
    expect(save.gacha.smallPity).toBe(0);
    expect(save.gacha.bigPity).toBe(0);
  });

  it('resets matching counters when rare or precious arrives early', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const rareSave = makeSave({ gacha: { smallPity: 8, bigPity: 20, history: [] } });
    const preciousSave = makeSave({ gacha: { smallPity: 8, bigPity: 20, history: [] } });

    drawGacha(rareSave, sequenceRandom(0.72, 0.99));
    drawGacha(preciousSave, sequenceRandom(0.95, 0.99));

    expect(rareSave.gacha).toMatchObject({ smallPity: 0, bigPity: 21 });
    expect(preciousSave.gacha).toMatchObject({ smallPity: 0, bigPity: 0 });
  });

  it('selects common rewards by weight and grants useful merit-neutral gold', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const smallGoldSave = makeSave();
    const largeGoldSave = makeSave();

    const smallGold = drawGacha(smallGoldSave, sequenceRandom(0, 0));
    const largeGold = drawGacha(largeGoldSave, sequenceRandom(0, 0.75));

    expect(smallGold).toMatchObject({
      rarity: 'common',
      rewardId: 'common-gold',
      kind: 'gold',
      amount: 60,
    });
    expect(smallGoldSave.gold).toBe(60);
    expect(largeGold).toMatchObject({
      rarity: 'common',
      rewardId: 'common-gold-large',
      kind: 'gold',
      amount: 120,
    });
    expect(largeGoldSave.gold).toBe(120);
  });

  it('unlocks a character once and converts its duplicate to useful gold', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const newSave = makeSave();
    const duplicateSave = makeSave({ unlockedChars: ['精'] });

    const unlocked = drawGacha(newSave, sequenceRandom(0.72, 0, 0));
    const duplicate = drawGacha(duplicateSave, sequenceRandom(0.72, 0, 0));

    expect(unlocked).toMatchObject({
      rarity: 'rare',
      kind: 'character',
      character: '精',
      converted: false,
    });
    expect(newSave.unlockedChars).toEqual(['精']);
    expect(duplicate).toMatchObject({
      rarity: 'rare',
      kind: 'character',
      character: '精',
      converted: true,
      amount: 120,
    });
    expect(duplicateSave.unlockedChars).toEqual(['精']);
    expect(duplicateSave.gold).toBe(120);
  });

  it('grants a new item and upgrades owned and equipped duplicates', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const newSave = makeSave();
    const duplicateSave = makeSave({
      items: {
        owned: { fire: 2 },
        equippedActive: [{ id: 'fire', level: 2 }],
        equippedPassive: [],
      },
    });

    const granted = drawGacha(newSave, sequenceRandom(0.72, 0.45, 0));
    const upgraded = drawGacha(duplicateSave, sequenceRandom(0.72, 0.45, 0));

    expect(granted).toMatchObject({
      rarity: 'rare',
      kind: 'item',
      itemId: 'fire',
      level: 1,
      upgraded: false,
    });
    expect(newSave.items.owned.fire).toBe(1);
    expect(upgraded).toMatchObject({
      rarity: 'rare',
      kind: 'item',
      itemId: 'fire',
      level: 3,
      upgraded: true,
    });
    expect(duplicateSave.items.owned.fire).toBe(3);
    expect(duplicateSave.items.equippedActive[0].level).toBe(3);
  });

  it('makes precious characters locked-first and precious items worth two levels', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const characterSave = makeSave({ unlockedChars: ['精'] });
    const itemSave = makeSave({
      items: {
        owned: { fire: 2 },
        equippedActive: [{ id: 'fire', level: 2 }],
        equippedPassive: [],
      },
    });

    const character = drawGacha(characterSave, sequenceRandom(0.95, 0, 0));
    const item = drawGacha(itemSave, sequenceRandom(0.95, 0.45, 0));

    expect(character).toMatchObject({
      rarity: 'precious',
      character: '铁',
      converted: false,
    });
    expect(characterSave.unlockedChars).toEqual(['精', '铁']);
    expect(item).toMatchObject({
      rarity: 'precious',
      itemId: 'fire',
      level: 4,
      upgraded: true,
    });
    expect(itemSave.items.owned.fire).toBe(4);
    expect(itemSave.items.equippedActive[0].level).toBe(4);
  });

  it('grants a first-time precious item directly at level two', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const save = makeSave();

    const result = drawGacha(save, sequenceRandom(0.95, 0.45, 0));

    expect(result).toMatchObject({
      rarity: 'precious',
      kind: 'item',
      itemId: 'fire',
      level: 2,
      upgraded: false,
    });
    expect(save.items.owned.fire).toBe(2);
  });

  it('converts a precious character to gold when the whole pool is unlocked', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const { ADV_CHARS } = await import('../config/units.js');
    const unlockedChars = Object.keys(ADV_CHARS);
    const save = makeSave({ unlockedChars: [...unlockedChars] });

    const result = drawGacha(save, sequenceRandom(0.95, 0, 0));

    expect(result).toMatchObject({
      rarity: 'precious',
      kind: 'character',
      character: unlockedChars[0],
      converted: true,
      amount: 400,
    });
    expect(save.gold).toBe(400);
    expect(save.unlockedChars).toEqual(unlockedChars);
  });

  it('grants the configured rare and precious gold rewards', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const rareSave = makeSave();
    const preciousSave = makeSave();

    const rare = drawGacha(rareSave, sequenceRandom(0.72, 0.99));
    const precious = drawGacha(preciousSave, sequenceRandom(0.95, 0.99));

    expect(rare).toMatchObject({ rarity: 'rare', rewardId: 'rare-gold', amount: 200 });
    expect(precious).toMatchObject({ rarity: 'precious', rewardId: 'precious-gold', amount: 600 });
    expect(rareSave.gold).toBe(200);
    expect(preciousSave.gold).toBe(600);
  });

  it('hits the 10-draw and 50-draw guarantees at their exact sequential draws', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const save = makeSave();
    const rarities = Array.from({ length: 50 }, () => drawGacha(save, () => 0).rarity);

    expect(rarities.slice(0, 9)).toEqual(Array(9).fill('common'));
    expect(rarities[9]).toBe('rare');
    expect(rarities.slice(10, 49).filter((rarity) => rarity === 'rare')).toHaveLength(3);
    expect(rarities[49]).toBe('precious');
    expect(save.gacha).toMatchObject({ smallPity: 0, bigPity: 0 });
  });

  it('preserves pity through serialized reloads before exact guarantees', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const { migrateSave } = await import('./saveData.js');
    let save = makeSave();

    for (let draw = 0; draw < 9; draw++) drawGacha(save, () => 0);
    save = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(drawGacha(save, () => 0).rarity).toBe('rare');

    for (let draw = 10; draw < 49; draw++) drawGacha(save, () => 0);
    save = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(drawGacha(save, () => 0).rarity).toBe('precious');
  });

  it('records the newest human-readable result and keeps only ten entries', async () => {
    const { drawGacha } = await import('./gachaEngine.js');
    const previous = Array.from({ length: 10 }, (_, index) => ({
      rarity: 'common',
      message: '旧记录 ' + index,
    }));
    const save = makeSave({
      gacha: { smallPity: 0, bigPity: 0, history: previous },
    });

    const result = drawGacha(save, sequenceRandom(0, 0));

    expect(result.message).toBe('获得军饷 60 金');
    expect(save.gacha.history).toHaveLength(10);
    expect(save.gacha.history[0]).toEqual({
      rarity: 'common',
      message: '获得军饷 60 金',
    });
    expect(save.gacha.history.map((entry) => entry.message)).not.toContain('旧记录 9');
  });
});

describe('gacha panel', () => {
  it('shows exact rates, pity distance, every reward category, and recent results', async () => {
    const { gachaPanelModel } = await import('./gacha.js');
    const save = makeSave({
      gacha: {
        smallPity: 4,
        bigPity: 12,
        history: [{ rarity: 'rare', message: '获得进阶字「关」' }],
      },
    });

    const model = gachaPanelModel(save);

    expect(model.baseRateLine).toBe('普通 72% · 稀有 23% · 珍贵 5%');
    expect(model.nextRateLine).toBe('普通 72% · 稀有 23% · 珍贵 5%');
    expect(model.pityLines).toEqual([
      '小保底：6 抽内必出稀有或以上',
      '大保底：38 抽内必出珍贵',
    ]);
    expect(model.rewardRows).toHaveLength(8);
    expect(model.rewardRows[0].text).toBe('普通 · 军饷 60 金 · 54%');
    expect(model.rewardRows[2].text).toBe('稀有 · 进阶字（全池） · 10.35%');
    expect(model.rewardRows[7].text).toBe('珍贵 · 军饷 600 金 · 1%');
    expect(model.history).toEqual([{ rarity: 'rare', message: '获得进阶字「关」' }]);
  });

  it('shows the effective next-draw distribution when pity is active', async () => {
    const { gachaPanelModel } = await import('./gacha.js');
    const smallPity = gachaPanelModel(makeSave({
      gacha: { smallPity: 9, bigPity: 20, history: [] },
    }));
    const bigPity = gachaPanelModel(makeSave({
      gacha: { smallPity: 9, bigPity: 49, history: [] },
    }));

    expect(smallPity.nextRateLine).toBe('普通 0% · 稀有 95% · 珍贵 5%');
    expect(smallPity.rewardRows[0].text).toBe('普通 · 军饷 60 金 · 0%');
    expect(smallPity.rewardRows[2].text).toBe('稀有 · 进阶字（全池） · 42.75%');
    expect(bigPity.nextRateLine).toBe('普通 0% · 稀有 0% · 珍贵 100%');
    expect(bigPity.rewardRows[7].text).toBe('珍贵 · 军饷 600 金 · 20%');
  });

  it('charges before drawing and leaves pity untouched when gold is insufficient', async () => {
    const { performGachaPull } = await import('./gacha.js');
    const poorSave = makeSave({ gold: 99 });
    const fundedSave = makeSave({ gold: 100 });

    const rejected = performGachaPull(poorSave, sequenceRandom(0, 0));
    const accepted = performGachaPull(fundedSave, sequenceRandom(0, 0));

    expect(rejected).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(poorSave.gold).toBe(99);
    expect(poorSave.gacha).toMatchObject({ smallPity: 0, bigPity: 0 });
    expect(accepted).toMatchObject({
      ok: true,
      result: { kind: 'gold', amount: 60 },
    });
    expect(fundedSave.gold).toBe(60);
  });
});
