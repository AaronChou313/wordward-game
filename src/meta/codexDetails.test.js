import { describe, expect, it } from 'vitest';
import { BASE_UNITS } from '../config/units.js';
import { PREFIX_BUFFS, HEROES } from '../config/words.js';
import { ITEMS } from '../config/items.js';
import { BOSS_ENEMIES, ELITE_ENEMIES } from '../config/enemies.js';
import { CODEX_CATS } from '../config/codex.js';
import { spawnPlan } from '../battle/spawnPlan.js';
import { detailFor, detailPresentation, isCodexUnlocked, recordCodexEncounter } from './codexDetails.js';

const CONFIGS = {
  base: Object.keys(BASE_UNITS),
  prefix: Object.keys(PREFIX_BUFFS),
  hero: Object.keys(HEROES),
  item: Object.keys(ITEMS),
  elite: ELITE_ENEMIES.map((enemy) => enemy.key),
  boss: BOSS_ENEMIES.map((enemy) => enemy.key),
};

describe('codex details', () => {
  it('lists every supported category in the codex grid', () => {
    expect(CODEX_CATS.map((category) => category.id)).toEqual([
      'base', 'prefix', 'hero', 'item', 'elite', 'boss',
    ]);
    for (const [category, keys] of Object.entries(CONFIGS)) {
      expect(CODEX_CATS.find((entry) => entry.id === category).keys).toEqual(keys);
    }
  });

  it('provides complete details for every configured entry', () => {
    for (const [category, keys] of Object.entries(CONFIGS)) {
      for (const key of keys) {
        const detail = detailFor(category, key);
        expect(detail, `${category}:${key}`).toEqual({
          title: expect.any(String),
          rows: expect.any(Array),
          description: expect.any(String),
          hint: expect.any(String),
        });
        expect(detail.title.length).toBeGreaterThan(0);
        expect(detail.rows.length).toBeGreaterThan(0);
        for (const row of detail.rows) {
          expect(row).toEqual({ label: expect.any(String), value: expect.any(String) });
          expect(row.label.length).toBeGreaterThan(0);
          expect(row.value.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes combat attributes and attack timing for base units', () => {
    const detail = detailFor('base', '弓');
    expect(detail.rows).toEqual(expect.arrayContaining([
      { label: '攻击', value: '14' },
      { label: '攻击间隔', value: '1.00 秒' },
      { label: '每秒攻击', value: '1.00' },
      { label: '射程', value: '3.6 格' },
      { label: '攻击类型', value: '远程单体' },
    ]));
  });

  it('shows prefix effects, hero recipes, and level-one item behavior', () => {
    expect(detailFor('prefix', '虎').rows).toContainEqual({ label: '首击伤害', value: '+100%' });
    expect(detailFor('hero', '诸葛亮').rows).toContainEqual({ label: '组词', value: '诸 + 葛 + 亮' });
    expect(detailFor('item', 'warDrum').rows).toEqual(expect.arrayContaining([
      { label: '类型', value: '主动·点击施放' },
      { label: 'Lv1 效果', value: '点击施放：全场减速 4s（冷却 50s）' },
    ]));
  });

  it('shows enemy multipliers and complete skill timing', () => {
    const detail = detailFor('boss', 'hulao-lubu');
    expect(detail.rows).toEqual(expect.arrayContaining([
      { label: '生命倍率', value: '×16' },
      { label: '速度倍率', value: '×0.55' },
      { label: '技能范围', value: '3 格' },
      { label: '眩晕时间', value: '3 秒' },
      { label: '技能冷却', value: '7 秒' },
      { label: '蓄力时间', value: '0.8 秒' },
    ]));
  });

  it('returns null for unknown categories or keys', () => {
    expect(detailFor('missing', '兵')).toBeNull();
    expect(detailFor('base', 'missing')).toBeNull();
  });

  it('derives unlocks from collection, inventory, and recorded enemy identities', () => {
    const save = {
      bestWave: 60,
      codex: { base: ['弓'], prefix: ['虎'], hero: ['赵云'], elite: [], boss: [] },
      items: { owned: { warDrum: 1 } },
      diff: { best: { hard: 12 } },
      merit: { claimed: {} },
    };

    expect(isCodexUnlocked('base', '弓', save)).toBe(true);
    expect(isCodexUnlocked('item', 'warDrum', save)).toBe(true);
    expect(isCodexUnlocked('item', 'fire', save)).toBe(false);
    expect(isCodexUnlocked('elite', 'quake-captain', save)).toBe(false);
    expect(isCodexUnlocked('elite', 'marksman-captain', save)).toBe(false);
    expect(isCodexUnlocked('boss', 'hulao-lubu', save)).toBe(false);

    expect(recordCodexEncounter(save, 'elite', 'marksman-captain')).toBe(true);
    expect(recordCodexEncounter(save, 'elite', 'marksman-captain')).toBe(false);
    expect(isCodexUnlocked('elite', 'marksman-captain', save)).toBe(true);
    expect(isCodexUnlocked('elite', 'quake-captain', save)).toBe(false);

    expect(recordCodexEncounter(save, 'boss', 'hulao-lubu')).toBe(true);
    expect(isCodexUnlocked('boss', 'hulao-lubu', save)).toBe(true);
    expect(isCodexUnlocked('boss', 'weiwu-caocao', save)).toBe(false);
    expect(recordCodexEncounter(save, 'boss', 'missing')).toBe(false);
  });

  it('unlocks only the special enemy identity actually selected for a wave', () => {
    const wave = { count: 1, hp: 100, speed: 1, spawnInterval: 1 };
    const encountered = spawnPlan(10, wave, () => 0).at(-1);
    const alternate = spawnPlan(10, wave, () => 0.99).at(-1);
    const save = { codex: { elite: [], boss: [] }, items: { owned: {} } };

    expect(encountered.key).not.toBe(alternate.key);
    expect(recordCodexEncounter(save, encountered.type, encountered.key)).toBe(true);
    expect(isCodexUnlocked('elite', encountered.key, save)).toBe(true);
    expect(isCodexUnlocked('elite', alternate.key, save)).toBe(false);
  });

  it('hides attributes and descriptions for locked entries', () => {
    const full = detailFor('boss', 'hulao-lubu');
    expect(detailPresentation(full, false)).toEqual({
      title: full.title,
      rows: [],
      description: '',
      hint: full.hint,
      locked: true,
    });
    expect(detailPresentation(full, true)).toEqual({ ...full, locked: false });
  });
});
