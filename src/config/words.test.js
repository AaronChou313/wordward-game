import { describe, expect, it } from 'vitest';
import { ADV_CHARS } from './units.js';
import { CODEX_META } from './codex.js';
import { HEROES, PREFIX_BUFFS } from './words.js';

describe('advanced character configuration', () => {
  it('defines the four new tactical prefixes with complete metadata', () => {
    expect(Object.keys(PREFIX_BUFFS)).toEqual(expect.arrayContaining(['虎', '盾', '火', '军']));
    for (const [char, prefix] of Object.entries(PREFIX_BUFFS)) {
      expect(ADV_CHARS[char]).toBeDefined();
      expect(prefix.label).toEqual(expect.any(String));
      expect(prefix.description).toEqual(expect.any(String));
      expect(prefix.color).toMatch(/^#/);
      expect(prefix.pool).toBe('prefix');
      expect(prefix.codex).toEqual(expect.objectContaining({ hint: expect.any(String) }));
      expect(prefix.effects).toEqual(expect.any(Object));
      expect(Object.keys(prefix.effects).length).toBeGreaterThan(0);
      expect(CODEX_META.prefix[char]).toEqual({
        color: prefix.color,
        description: prefix.description,
        hint: prefix.codex.hint,
      });
    }
  });

  it('gives every advanced character a prefix or hero combination', () => {
    const used = new Set([
      ...Object.keys(PREFIX_BUFFS),
      ...Object.keys(HEROES).flatMap((name) => Array.from(name)),
    ]);
    expect(Object.keys(ADV_CHARS).filter((char) => !used.has(char))).toEqual([]);
  });

  it('references only defined advanced characters in every combination', () => {
    for (const name of Object.keys(HEROES)) {
      for (const char of Array.from(name)) expect(ADV_CHARS[char]).toBeDefined();
    }
  });
});

describe('advanced prefix combat hooks', () => {
  it('applies tiger burst only on a tower first hitting each enemy', async () => {
    const { firstHitDamage } = await import('../battle/tower.js');
    const tower = {};
    const firstEnemy = {};
    const secondEnemy = {};

    expect(firstHitDamage(tower, firstEnemy, 100, 1)).toBe(200);
    expect(firstHitDamage(tower, firstEnemy, 100, 1)).toBe(100);
    expect(firstHitDamage(tower, secondEnemy, 100, 1)).toBe(200);
  });

  it('lets shield effects strengthen blocker health and capacity', async () => {
    const { Tower } = await import('../battle/tower.js');
    const { rescan } = await import('../battle/wordSystem.js');
    const baseline = new Tower('兵', 1, 0, 0, 'base');
    baseline.deployAsBlocker();
    const shield = advanced('盾', 0, 0);
    const shielded = new Tower('兵', 1, 1, 0, 'base');
    shielded.deployAsBlocker();
    shielded.takeBlockDamage(baseline.blockMaxHp / 2);
    const grid = testGrid(2, 1, [shield, shielded]);

    rescan(grid, [shield, shielded], [], null);

    expect(shielded.blockMaxHp).toBe(Math.round(baseline.blockMaxHp * 1.5));
    expect(shielded.blockHp).toBe(Math.round(shielded.blockMaxHp / 2));
    expect(shielded.blockCapacity).toBe(baseline.blockCapacity + 1);

    grid.cells[0][0].tower = null;
    rescan(grid, [shielded], [], null);

    expect(shielded.blockMaxHp).toBe(baseline.blockMaxHp);
    expect(shielded.blockHp).toBe(Math.round(baseline.blockMaxHp / 2));
    expect(shielded.blockCapacity).toBe(baseline.blockCapacity);
  });

  it('ticks fire damage over time and attributes a lethal burn to its source', async () => {
    const { advanceBurnEffect, applyBurnEffect } = await import('../battle/enemy.js');
    const source = {};
    const enemy = { hp: 10, dead: false, burn: null };
    enemy.takeDamage = (damage) => {
      enemy.hp -= damage;
      if (enemy.hp > 0) return false;
      enemy.dead = true;
      return true;
    };

    applyBurnEffect(enemy, source, 3, 4);
    expect(advanceBurnEffect(enemy, 2)).toEqual({ damage: 8, killed: false, source });
    expect(advanceBurnEffect(enemy, 1)).toEqual({ damage: 2, killed: true, source });
  });

  it('lets an army-prefixed unit strengthen adjacent allied base units', async () => {
    const { rescan } = await import('../battle/wordSystem.js');
    const army = advanced('军', 0, 0);
    const anchor = base('兵', 1, 0);
    const ally = base('弓', 2, 0);
    const grid = testGrid(3, 1, [army, anchor, ally]);

    rescan(grid, [army, anchor, ally], [], null);

    expect(anchor.buffs.adjacentAura).toBe(0.2);
    expect(ally.buffs.damage).toBe(0.2);
  });
});

function advanced(char, c, r) {
  return { char, c, r, kind: 'adv', group: null, buffs: {}, buffChars: [], flash: 0 };
}

function base(char, c, r) {
  return { char, c, r, kind: 'base', group: null, buffs: {}, buffChars: [], flash: 0 };
}

function testGrid(width, height, towers) {
  const cells = Array.from({ length: height }, (_, r) => (
    Array.from({ length: width }, (_, c) => ({ c, r, tower: null }))
  ));
  for (const tower of towers) cells[tower.r][tower.c].tower = tower;
  return {
    cells,
    get(c, r) {
      return cells[r] && cells[r][c];
    },
  };
}
