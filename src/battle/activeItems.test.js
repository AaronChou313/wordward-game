import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleScene, dispatchActiveItem } from './battleScene.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Tower } from './tower.js';
import { BASE_UNITS } from '../config/units.js';

let storage;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// 新建一场战斗：完整 enter() 路径，得到真实的棋盘/特效/道具系统
function freshScene() {
  const scene = new BattleScene({});
  scene.enter();
  return scene;
}

describe('active item: damage-strongest (雷击符)', () => {
  it('hits only the strongest alive enemy and leaves weaker ones untouched', () => {
    const scene = freshScene();
    scene.enemies = [new Enemy(50, 0), new Enemy(100, 0)];
    const strong = scene.enemies[1];
    const weak = scene.enemies[0];
    const active = { id: 'thunder', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toMatchObject({ used: true, message: '雷击符：雷击最强者', sound: 'boom' });
    expect(strong.hp).toBeLessThan(100);
    expect(weak.hp).toBe(50);
    expect(active.cd).toBe(40);
  });

  it('kills the strongest enemy through the unified kill path when damage exceeds hp', () => {
    const scene = freshScene();
    scene.score.kills = 0;
    scene.enemies = [new Enemy(50, 0), new Enemy(100, 0)];
    const strong = scene.enemies[1];
    const active = { id: 'thunder', level: 1, cd: 0 };

    dispatchActiveItem(scene, active);

    expect(strong.dead).toBe(true);
    expect(scene.score.kills).toBe(1);
  });

  it('clamps the damage text to the actual hp lost on overkill', () => {
    const scene = freshScene();
    const target = new Enemy(30, 0); // 目标 hp 30，小于雷击伤害 220
    scene.enemies = [target];
    const active = { id: 'thunder', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result.used).toBe(true);
    expect(target.dead).toBe(true);
    const floating = scene.effects.texts.at(-1);
    expect(floating.text).toBe('-30');
    expect(floating.color).toBe('#ffd75a');
  });

  it('refuses to fire when no enemies are alive', () => {
    const scene = freshScene();
    scene.enemies = [new Enemy(10, 0)];
    scene.enemies[0].dead = true;
    const active = { id: 'thunder', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toEqual({ used: false, message: '当前没有敌军' });
    expect(active.cd).toBe(0);
  });
});

describe('active item: heal-lord (治疗符)', () => {
  it('restores lord hp up to the maximum', () => {
    const scene = freshScene();
    scene.lordHp = 3;
    const active = { id: 'heal', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toMatchObject({ used: true, message: '治疗符：主公回复 2 生命', sound: 'click' });
    expect(scene.lordHp).toBe(5);
    expect(active.cd).toBe(35);
  });

  it('does not overheal beyond the maximum', () => {
    const scene = freshScene();
    scene.lordHp = 3;
    const active = { id: 'heal', level: 20, cd: 0 }; // 20 级：heal 21，远超上限

    dispatchActiveItem(scene, active);

    expect(scene.lordHp).toBe(scene.lordHpMax());
  });

  it('reports the actual hp gained when healing would overfill', () => {
    const scene = freshScene();
    scene.lordHp = 18; // 上限 20，可回复 2，不足 heal 21
    const active = { id: 'heal', level: 20, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toMatchObject({ used: true, message: '治疗符：主公回复 2 生命', sound: 'click' });
    expect(scene.lordHp).toBe(20);
    const floating = scene.effects.texts.at(-1);
    expect(floating.text).toBe('+2');
    expect(floating.color).toBe('#7fe08a');
  });

  it('computes the lord max hp from the base and the bonus', () => {
    const scene = freshScene();
    scene.lordHpBonus = 3;
    expect(scene.lordHpMax()).toBe(23);
  });
});

describe('active item: summon-random (召唤符)', () => {
  it('places a random base unit on an empty active slot cell', () => {
    const scene = freshScene();
    const placedBefore = scene.towers.length;
    const active = { id: 'summon', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result.used).toBe(true);
    expect(scene.towers.length).toBe(placedBefore + 1);
    const placed = scene.towers[scene.towers.length - 1];
    expect(BASE_UNITS[placed.char]).toBeDefined();
    expect(placed.kind).toBe('base');
    expect(placed.tier).toBe(1);
    // 必须落在已激活且当前为空的格子
    const cell = scene.grid.get(placed.c, placed.r);
    expect(cell.tower).toBe(placed);
    expect(cell.active).toBe(true);
    expect(cell.kind).toBe('slot');
  });

  it('refuses to fire when the board has no free space', () => {
    const scene = freshScene();
    const slots = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 7; c++) {
        const cell = scene.grid.get(c, r);
        if (cell.kind === 'slot' && cell.active) slots.push([c, r]);
      }
    }
    const count = slots.length;
    // 用固定可放置的普通兵塞满所有激活格
    for (const [c, r] of slots) {
      const tower = new Tower('弓', 1, c, r, 'base');
      scene.grid.get(c, r).tower = tower;
      scene.towers.push(tower);
    }
    expect(scene.towers.length).toBe(count);
    // 固定抽到非「兵」字符，避免随机抽到「兵」时被放到路径格上（兵允许阻挡，不属于空位）
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const active = { id: 'summon', level: 1, cd: 0 };

    const result = dispatchActiveItem(scene, active);

    expect(result).toEqual({ used: false, message: '没有可放置的位置' });
    expect(scene.towers.length).toBe(count);
    expect(active.cd).toBe(0);
    random.mockRestore();
  });
});

describe('passive item combat hooks: critFlag / ironwall / rapidFlag / granary', () => {
  it('adds the critFlag passive crit to tower stats', () => {
    const tower = new Tower('弓', 1, 1, 0, 'base');
    const s = tower.stats({ crit: 0.08 }, {});
    expect(s.crit).toBeCloseTo(0.08);
    // 与武器/词组暴击可叠加
    tower.buffs.crit = 0.35;
    expect(tower.stats({ crit: 0.08 }, { crit: 0.1 }).crit).toBeCloseTo(0.53);
  });

  it('reduces blocker damage by the ironwall fraction', async () => {
    const { blockDamage } = await import('./blocking.js');
    // 无道具：保持既有数值（min 4）
    expect(blockDamage({ maxHp: 100 })).toBe(4);
    expect(blockDamage({ maxHp: 250 })).toBe(6);
    // ironwall Lv1：-15%
    expect(blockDamage({ maxHp: 250 }, { blockerDamageReduction: 0.15 })).toBe(5);
    // 大额减免也至少 1 点伤害
    expect(blockDamage({ maxHp: 250 }, { blockerDamageReduction: 0.9 })).toBe(1);
  });

  it('feeds the ironwall reduction through the blocker update loop', () => {
    const scene = freshScene();
    scene.itemBuffs = { blockerDamageReduction: 0.15 };
    const blocker = new Tower('兵', 1, 1, 1, 'base'); // (1,1) 是道路格
    blocker.deployAsBlocker(scene.itemBuffs);
    const blockerInitialHp = blocker.blockHp;

    const enemy = new Enemy(250, 0);
    enemy.setBlocker(blocker);
    enemy.dist = 96; // (1,1) 的路径起点附近
    enemy.update(1, {});
    enemy.update(0, {});
    enemy.update(0, {});

    // 被阻挡的敌人本帧攻击：blockDamage(250, {reduction:0.15}) = 5
    expect(blocker.blockHp).toBe(blockerInitialHp - 5);
  });

  it('includes rapidFlag speed and granary coin in the battle aggregates', async () => {
    const { aggregatePassiveItemBuffs } = await import('./battleScene.js');
    const aggregate = aggregatePassiveItemBuffs([
      { id: 'rapidFlag', level: 1 },
      { id: 'granary', level: 1 },
      { id: 'critFlag', level: 1 },
      { id: 'ironwall', level: 1 },
    ]);
    expect(aggregate).toMatchObject({
      spd: 0.08,
      coin: 0.15,
      crit: 0.08,
      blockerDamageReduction: 0.15,
    });
  });
});
