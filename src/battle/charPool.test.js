import { describe, expect, it } from 'vitest';
import { createCharPool } from './charPool.js';

describe('finite advanced-character pool', () => {
  it('allocates prefix, two-character hero, and three-character-only quantities', () => {
    const pool = createCharPool(['精', '赵', '云', '诸', '葛', '亮']);

    expect(pool.snapshot()).toEqual({
      '精': { initial: 3, remaining: 3 },
      '赵': { initial: 2, remaining: 2 },
      '云': { initial: 2, remaining: 2 },
      '诸': { initial: 1, remaining: 1 },
      '葛': { initial: 1, remaining: 1 },
      '亮': { initial: 1, remaining: 1 },
    });
    expect(pool.remainingTotal()).toBe(10);
  });

  it('caps inventory at 28 copies in unlock order without partial allocations', () => {
    const pool = createCharPool([
      '精', '铁', '神', '烈', '谋',
      '赵', '云', '吕', '布', '关', '羽', '诸', '葛', '亮', '张', '飞', '曹', '操',
    ], () => 0);

    expect(pool.remainingTotal()).toBe(28);
    expect(pool.snapshot()).toEqual({
      '精': { initial: 3, remaining: 3 },
      '铁': { initial: 3, remaining: 3 },
      '神': { initial: 3, remaining: 3 },
      '烈': { initial: 3, remaining: 3 },
      '谋': { initial: 3, remaining: 3 },
      '赵': { initial: 2, remaining: 2 },
      '云': { initial: 2, remaining: 2 },
      '吕': { initial: 2, remaining: 2 },
      '布': { initial: 2, remaining: 2 },
      '关': { initial: 2, remaining: 2 },
      '羽': { initial: 2, remaining: 2 },
      '诸': { initial: 1, remaining: 1 },
    });
  });

  it('does not permanently starve characters appended by a save migration', () => {
    const legacyOrder = [
      '精', '铁', '神', '烈', '谋',
      '赵', '云', '吕', '布', '诸', '葛', '亮', '关', '羽', '张', '飞',
      '曹', '操', '周', '瑜', '马', '超', '黄', '忠', '貂', '蝉', '孙', '尚', '香',
      '虎', '盾', '火', '军',
    ];

    const pool = createCharPool(legacyOrder, () => 0.9);

    expect(pool.remainingTotal()).toBeLessThanOrEqual(28);
    expect(Object.keys(pool.snapshot())).toEqual(expect.arrayContaining(['虎', '盾', '火', '军']));
  });

  it('draws a selected copy once and never returns exhausted characters', () => {
    const pool = createCharPool(['赵', '云']);

    expect(pool.draw(() => 0)).toBe('赵');
    expect(pool.remaining('赵')).toBe(1);
    expect(pool.draw(() => 0)).toBe('赵');
    expect(pool.remaining('赵')).toBe(0);
    expect(pool.draw(() => 0)).toBe('云');
    expect(pool.draw(() => 0)).toBe('云');
    expect(pool.draw(() => 0)).toBeNull();
    expect(pool.remainingTotal()).toBe(0);
  });
});
