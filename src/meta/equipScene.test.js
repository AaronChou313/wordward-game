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

import { EquipScene } from './equipScene.js';

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
    scene.onPointerDown(100, 500);
    scene.onPointerUp(102, 501); // moved < 10px
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
