import { describe, expect, it, vi } from 'vitest';

// 由于 equipScene.js 以具名导入方式引用 ./saveData.js 的 getSave / persist / equipByUid，
// 必须用 vi.mock 拦截模块（vi.stubGlobal 无法替换模块级具名导入）。
// 工厂函数在场景模块被导入时执行，因此 fakeSave 需先定义、并通过模块级 currentSave 可变共享。
let currentSave = null;

function fakeSave(ownedCount = 3) {
  const owned = [];
  for (let i = 0; i < ownedCount; i++) {
    owned.push({ uid: i + 1, id: 'p_sword', rarity: 'common', lvl: 1 });
  }
  currentSave = {
    gold: 300, gems: 10, soulJade: 3,
    unlockedChars: ['精', '铁', '赵', '云', '吕', '布'],
    equipment: {
      owned, nextUid: ownedCount + 1,
      player: { '武器': null, '护甲': null, '饰品': null },
      units: { '兵': null, '骑': null, '枪': null, '弓': null, '炮': null },
    },
  };
  return currentSave;
}

vi.mock('./saveData.js', () => ({
  getSave: () => currentSave,
  persist: () => {},
  equipByUid: (uid) => currentSave.equipment.owned.find((e) => e.uid === uid) || null,
  spendGems: (n) => { if ((currentSave.gems || 0) < n) return false; currentSave.gems -= n; return true; },
  spendSoulJade: (n) => { if ((currentSave.soulJade || 0) < n) return false; currentSave.soulJade -= n; return true; },
}));

import { EquipScene, ROW_H } from './equipScene.js';

describe('EquipScene list scrolling', () => {
  it('does not equip when dragging past the threshold', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(8); // enough rows to scroll
    scene.onPointerDown(100, 500);
    scene.onPointerMove(105, 440); // moved 60px upward -> scrolls deeper
    scene.onPointerUp(105, 440);
    expect(scene.scroll).toBeGreaterThan(0);
    expect(save.equipment.player['武器']).toBe(null); // 拖动不应触发装备
  });

  it('equips on a tap with no drag', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(3);
    // 新几何：第一行行顶 y=470，装备按钮区（x 60-210, y 536-584）内
    scene.onPointerDown(100, 550);
    scene.onPointerUp(100, 550); // moved < 10px
    expect(save.equipment.player['武器']).toBe(1); // first owned uid equipped
  });

  it('clamps scroll to the list bounds', () => {
    const scene = new EquipScene({ switch: () => {} });
    fakeSave(20);
    scene.scroll = 999999;
    scene.onPointerDown(100, 500);
    scene.onPointerMove(105, 400); // drag up
    scene.onPointerUp(105, 400);
    expect(scene.scroll).toBeLessThanOrEqual(scene.maxScroll());
  });

  it('enhances an equipment instance with gems', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(1);
    const inst = save.equipment.owned[0];
    scene.enhance(inst.uid);
    expect(inst.lvl).toBe(2);
    expect(save.gems).toBe(0); // 10 - 10 (lvl1 提升成本 = 10 + 5*0)
  });

  it('refines an equipment instance with soul jade, re-rolling affixes', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(1);
    const inst = save.equipment.owned[0];
    inst.affixes = [{ key: 'atk', value: 0.03 }]; // legacy-style pre-refine affixes
    expect(save.soulJade).toBe(3);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    scene.refine(inst.uid);

    expect(save.soulJade).toBe(2); // cost 1 soul jade
    // common rarity re-rolls 1 affix; random=0.5 -> key 'range', value 0.02+(0.05-0.02)*0.5
    expect(inst.affixes).toEqual([{ key: 'range', value: 0.035 }]);
  });
});

describe('EquipScene two-zone rows', () => {
  it('uses a taller row so text and buttons do not overlap', () => {
    expect(ROW_H).toBeGreaterThanOrEqual(120);
  });

  it('places the enhance and refine buttons in the bottom zone of the row', () => {
    const scene = new EquipScene({ switch: () => {} });
    const er = scene.enhanceRect(500);
    const rr = scene.refineRect(500);
    const eq = scene.equipRect(500);
    // buttons sit below the text zone (text is ~top to top+62)
    expect(er.y).toBeGreaterThanOrEqual(500 + 66);
    expect(rr.y).toBeGreaterThanOrEqual(500 + 66);
    expect(eq.y).toBeGreaterThanOrEqual(500 + 66);
    // 三个按钮并排（装备→升→洗练，从左到右），互不重叠，均落在行宽内
    expect(eq.x).toBeLessThan(er.x);
    expect(er.x).toBeLessThan(rr.x);
    expect(eq.x).toBeGreaterThanOrEqual(60);
    expect(rr.x + rr.w).toBeLessThanOrEqual(681);
  });
});

describe('EquipScene dynamic unit weapon slots', () => {
  it('includes unlocked heroes in unit weapon slots', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(1);
    // unlockedChars 含 赵/云/吕/布，故 赵云、吕布 解锁
    const slots = scene.unitSlotNames(save);
    expect(slots).toEqual(expect.arrayContaining(['兵', '骑', '枪', '弓', '炮', '赵云', '吕布']));
    expect(slots).not.toContain('诸葛亮'); // 未解锁 诸/葛/亮
  });

  it('wraps dynamic slots into multiple rows on the units tab', () => {
    const scene = new EquipScene({ switch: () => {} });
    fakeSave(1);
    scene.tab = 'unit';
    const rects = scene.slotRects();
    expect(rects.length).toBe(scene.unitSlotNames(currentSave).length);
    const ys = new Set(rects.map((r) => r.y));
    expect(ys.size).toBeGreaterThan(1); // 多于一行
    // 同一行内不重叠，且都在屏幕宽度内
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(750);
    }
    for (let i = 1; i < rects.length; i++) {
      if (rects[i].y === rects[i - 1].y) {
        expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].w);
      }
    }
  });
});
