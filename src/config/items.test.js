import { describe, expect, it } from 'vitest';
import { RefreshBar } from '../battle/refreshBar.js';
import { ITEMS } from './items.js';

const ACTIVE_IDS = ['fire', 'recruit', 'train', 'reinforce', 'warDrum', 'frost', 'thunder', 'heal', 'summon'];
const PASSIVE_IDS = ['power', 'swift', 'goldpot', 'fortification', 'bossBane', 'resolute', 'critFlag', 'rapidFlag', 'granary', 'ironwall'];

describe('item configuration', () => {
  it('defines unique IDs and complete shared descriptions', () => {
    const entries = Object.entries(ITEMS);
    const ids = entries.map(([, item]) => item.id);

    expect(new Set(ids).size).toBe(entries.length);
    for (const [key, item] of entries) {
      expect(item.id).toBe(key);
      expect(item.name).toBeTruthy();
      expect(item.desc).toBeTruthy();
      expect(item.price).toBeGreaterThan(0);
      expect(item.descAt(1)).toBeTruthy();
    }
  });

  it('requires every active item to declare cooldown, cast mode, and effect only', () => {
    const actives = Object.values(ITEMS).filter((item) => item.kind === 'active');

    expect(actives.map((item) => item.id)).toEqual(ACTIVE_IDS);
    for (const item of actives) {
      expect(typeof item.cooldownAt).toBe('function');
      expect(item.cooldownAt(1)).toBeGreaterThan(0);
      expect(['instant', 'target']).toContain(item.castMode);
      expect(item.effect).toMatchObject({ type: expect.any(String) });
      expect(item).not.toHaveProperty('buffs');
    }
  });

  it('requires every passive item to expose buffs without activation fields', () => {
    const passives = Object.values(ITEMS).filter((item) => item.kind === 'passive');

    expect(passives.map((item) => item.id)).toEqual(PASSIVE_IDS);
    for (const item of passives) {
      expect(typeof item.buffs).toBe('function');
      expect(item).not.toHaveProperty('cooldownAt');
      expect(item).not.toHaveProperty('castMode');
      expect(item).not.toHaveProperty('effect');
    }
  });

  it('gives new tactical items their intended active and passive identities', () => {
    expect(ITEMS.reinforce).toMatchObject({ name: '援军令', castMode: 'instant', effect: { type: 'fill-empty-bar' } });
    expect(ITEMS.warDrum).toMatchObject({ name: '止战鼓', castMode: 'instant', effect: { type: 'slow-all' } });
    expect(ITEMS.fortification.buffs(1)).toMatchObject({ blockerHp: 0.25, blockerCapacity: 1 });
    expect(ITEMS.bossBane.buffs(1)).toMatchObject({ bossDamage: 0.25 });
    expect(ITEMS.resolute.buffs(1)).toMatchObject({ stunDuration: 0.2 });
    expect(ITEMS.frost).toMatchObject({ name: '冰霜符', castMode: 'instant', effect: { type: 'slow-all' } });
    expect(ITEMS.thunder).toMatchObject({ name: '雷击符', castMode: 'instant', effect: { type: 'damage-strongest' } });
    expect(ITEMS.heal).toMatchObject({ name: '治疗符', castMode: 'instant', effect: { type: 'heal-lord' } });
    expect(ITEMS.summon).toMatchObject({ name: '召唤符', castMode: 'instant', effect: { type: 'summon-random' } });
    expect(ITEMS.critFlag.buffs(1)).toMatchObject({ crit: 0.08 });
    expect(ITEMS.rapidFlag.buffs(1)).toMatchObject({ spd: 0.08 });
    expect(ITEMS.granary.buffs(1)).toMatchObject({ coin: 0.15 });
    expect(ITEMS.ironwall.buffs(1)).toMatchObject({ blockerDamageReduction: 0.15 });
  });
});

describe('active item dispatch', () => {
  it('provides one handler for every configured active effect type', async () => {
    const { ACTIVE_ITEM_HANDLERS } = await import('../battle/battleScene.js');
    const configuredTypes = [...new Set(Object.values(ITEMS)
      .filter((item) => item.kind === 'active')
      .map((item) => item.effect.type))];

    expect(Object.keys(ACTIVE_ITEM_HANDLERS)).toEqual(configuredTypes);
  });

  it('rejects a passive or unknown ID in the active slot without throwing', async () => {
    const { dispatchActiveItem } = await import('../battle/battleScene.js');

    expect(dispatchActiveItem({}, { id: 'power', level: 1, cd: 0 })).toEqual({
      used: false,
      message: '道具效果不可用',
    });
    expect(dispatchActiveItem({}, { id: 'missing', level: 1, cd: 0 })).toEqual({
      used: false,
      message: '道具效果不可用',
    });
  });

  it('fills only empty bar slots with the reinforcement handler', async () => {
    const { dispatchActiveItem } = await import('../battle/battleScene.js');
    const bar = new RefreshBar([], null, null, () => 0.99);
    const existing = { char: '兵', kind: 'base', tier: 3, level: 2, xp: 4 };
    bar.slots = [null, existing, null, existing, null];
    const scene = { bar };
    const active = { id: 'reinforce', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toMatchObject({ used: true, message: '援军令：补充 3 名将士' });
    expect(bar.slots.every(Boolean)).toBe(true);
    expect(bar.slots[1]).toBe(existing);
    expect(bar.slots[3]).toBe(existing);
    expect(active.cd).toBe(35);
  });

  it('slows living enemies for the configured duration and factor', async () => {
    const { dispatchActiveItem } = await import('../battle/battleScene.js');
    const living = { dead: false, slowTimer: 1, slowFactor: 0.8 };
    const dead = { dead: true, slowTimer: 0, slowFactor: 1 };
    const active = { id: 'warDrum', level: 1, cd: 0 };

    const result = dispatchActiveItem({ enemies: [living, dead] }, active);

    expect(result).toMatchObject({ used: true, message: '止战鼓：敌军行动迟滞' });
    expect(living).toMatchObject({ slowTimer: 4, slowFactor: 0.5 });
    expect(dead).toMatchObject({ slowTimer: 0, slowFactor: 1 });
    expect(active.cd).toBe(50);
  });

  it('keeps war drum, aura, and charm slows on independent timers', async () => {
    const { advanceSlowEffects, applySlowEffect } = await import('../battle/enemy.js');
    const enemy = { slowEffects: {}, slowTimer: 0, slowFactor: 1 };

    applySlowEffect(enemy, 'warDrum', 4, 0.5);
    applySlowEffect(enemy, 'aura', 0.3, 0.75);
    applySlowEffect(enemy, 'charm', 1.5, 0.6);
    advanceSlowEffects(enemy, 0.4);

    expect(enemy.slowEffects).toEqual({
      warDrum: { timer: 3.6, factor: 0.5 },
      charm: { timer: 1.1, factor: 0.6 },
    });
    expect(enemy.slowTimer).toBe(3.6);
    expect(enemy.slowFactor).toBe(0.5);
  });

  it('promotes only a supplied target and triggers board recalculation', async () => {
    const { dispatchActiveItem } = await import('../battle/battleScene.js');
    const target = {
      char: '兵', tier: 2, cool: 4, x: 10, y: 20,
      refillBlocker() { this.refilled = true; },
    };
    const scene = {
      afterBoardChangeCalls: 0,
      afterBoardChange() { this.afterBoardChangeCalls++; },
      effects: { ring() {}, damageText() {} },
    };
    const active = { id: 'train', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active, target);

    expect(result).toMatchObject({ used: true, message: '练兵符：兵 升至 3 阶' });
    expect(target).toMatchObject({ tier: 3, cool: 0, refilled: true });
    expect(scene.afterBoardChangeCalls).toBe(1);
    expect(active.cd).toBe(60);
  });
});

describe('passive item combat hooks', () => {
  it('aggregates equipped passive buffs once and ignores invalid entries', async () => {
    const { aggregatePassiveItemBuffs } = await import('../battle/battleScene.js');

    expect(aggregatePassiveItemBuffs([
      { id: 'power', level: 1 },
      { id: 'fortification', level: 1 },
      { id: 'bossBane', level: 1 },
      { id: 'resolute', level: 1 },
      { id: 'fire', level: 9 },
      { id: 'missing', level: 1 },
    ])).toEqual({
      atk: 0.15,
      blockerHp: 0.25,
      blockerCapacity: 1,
      bossDamage: 0.25,
      stunDuration: 0.2,
    });
  });

  it('applies fortification health and capacity to blocker stats', async () => {
    const { blockStats } = await import('../battle/blocking.js');

    expect(blockStats(1, 1, { blockerHp: 0.25, blockerCapacity: 1 })).toEqual({
      maxHp: 175,
      capacity: 2,
    });
  });

  it('applies boss damage only to Boss targets', async () => {
    const { damageForTarget } = await import('../battle/tower.js');

    expect(damageForTarget(100, { type: 'boss' }, { bossDamage: 0.25 })).toBe(125);
    expect(damageForTarget(100, { type: 'elite' }, { bossDamage: 0.25 })).toBe(100);
  });

  it('reduces enemy skill stun duration without going below zero', async () => {
    const { stunDurationAfterBuffs } = await import('../battle/battleScene.js');

    expect(stunDurationAfterBuffs(4, { stunDuration: 0.2 })).toBeCloseTo(3.2);
    expect(stunDurationAfterBuffs(4, { stunDuration: 2 })).toBe(0);
  });
});

describe('battle item save normalization', () => {
  it('accepts legacy strings but filters unknown and passive active-slot entries', async () => {
    const { normalizeActiveItems } = await import('../battle/battleScene.js');

    expect(normalizeActiveItems([
      'fire',
      { id: 'train', level: 99 },
      { id: 'power', level: 1 },
      { id: 'missing', level: 1 },
    ], {
      fire: 2,
      train: 3,
      power: 1,
    })).toEqual([
      { id: 'fire', level: 2, cd: 0 },
      { id: 'train', level: 3, cd: 0 },
    ]);
  });

  it('deduplicates corrupted active slots and enforces the three-slot cap', async () => {
    const { normalizeActiveItems } = await import('../battle/battleScene.js');
    const owned = { fire: 2, train: 3, recruit: 1, reinforce: 1, warDrum: 1 };

    expect(normalizeActiveItems([
      'fire',
      { id: 'fire', level: 99 },
      'train',
      'recruit',
      'reinforce',
      'warDrum',
    ], owned)).toEqual([
      { id: 'fire', level: 2, cd: 0 },
      { id: 'train', level: 3, cd: 0 },
      { id: 'recruit', level: 1, cd: 0 },
    ]);
  });
});

describe('inventory item presentation', () => {
  it('gives instant and targeted active items distinct activation hints', async () => {
    const { inventoryItemPresentation } = await import('../meta/inventory.js');

    expect(inventoryItemPresentation(ITEMS.reinforce, 1)).toEqual({
      border: '#c98ab8',
      heading: '主动战术 · 点击施放',
      detail: '点击施放：只补充空栏位（冷却 35s）',
    });
    expect(inventoryItemPresentation(ITEMS.train, 1).heading).toBe('主动战术 · 拖拽施放');
  });

  it('marks passive items as persistent and never activatable', async () => {
    const { inventoryItemPresentation } = await import('../meta/inventory.js');

    expect(inventoryItemPresentation(ITEMS.fortification, 1)).toEqual({
      border: '#79b8a8',
      heading: '被动军略 · 持续生效',
      detail: '阻挡兵生命 +25%，容量 +1',
    });
  });
});
