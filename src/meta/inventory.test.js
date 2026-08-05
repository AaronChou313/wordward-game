import { describe, expect, it, vi } from 'vitest';
import { InventoryScene } from './inventory.js';

// 与 equipScene.test.js 相同的延迟工厂模式：vi.mock 工厂在场景模块被导入时执行，
// 因此 getSave 必须通过模块级可变 currentSave 读取，由 fakeSave() 在测试内注入，
// 以便后续断言能对存档做变更（例如点击已装备栏触发 toggleEquip 的增删）。
let currentSave = null;

function fakeSave() {
  currentSave = {
    gold: 300, gems: 10, soulJade: 3,
    items: {
      owned: { fire: 2, power: 1, swift: 1 },
      equippedActive: [{ id: 'fire', level: 2 }],
      equippedPassive: [{ id: 'power', level: 1 }],
    },
  };
  return currentSave;
}

vi.mock('./saveData.js', () => ({
  getSave: () => currentSave,
  spendGold: () => true,
  addGold: () => {},
  persist: () => {},
}));

// canvas 2D 上下文桩：记录 fillText 调用，其余绘图方法为 no-op。
// 场景与 Button 渲染路径会调用 beginPath/moveTo/arcTo/closePath/fill/stroke 等
//（Button.draw / drawPanel 均经由 roundRect），因此这些方法也需实现。
function stubCanvas() {
  return {
    calls: [],
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '',
    lineWidth: 1, globalAlpha: 1, shadowBlur: 0, shadowColor: '',
    fillText(text, x, y) { this.calls.push({ text, x, y }); },
    measureText() { return { width: 0 }; },
    fillRect() {}, strokeRect() {}, beginPath() {}, rect() {}, clip() {},
    save() {}, restore() {}, translate() {}, arc() {}, stroke() {},
    moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fill() {},
  };
}

describe('InventoryScene equipped bar', () => {
  it('lists equipped items at the top', () => {
    fakeSave();
    const scene = new InventoryScene({ switch: () => {} });
    const ctx = stubCanvas();
    scene.render(ctx);
    const texts = ctx.calls.map((c) => c.text).filter(Boolean);
    expect(texts.some((t) => String(t).includes('已装备'))).toBe(true);
    expect(texts.some((t) => String(t).includes('烈火符'))).toBe(true);
    expect(texts.some((t) => String(t).includes('武力卷轴'))).toBe(true);
  });

  it('tapping an equipped item in the bar unequips it', () => {
    fakeSave();
    const scene = new InventoryScene({ switch: () => {} });
    scene.render(stubCanvas()); // 渲染会记录已装备栏各道具的命中区域
    // 点击已装备栏第一个道具（烈火符）：栏内第 0 个道具位于 x=150..280
    scene.onPointerDown(170, 270);
    scene.onPointerUp(170, 270);
    expect(currentSave.items.equippedActive).toEqual([]);
    expect(currentSave.items.equippedPassive).toEqual([{ id: 'power', level: 1 }]);
  });
});
