import { describe, expect, it, vi } from 'vitest';
import { HomeScene } from './homeScene.js';

// 存档桩：gold/gems/soulJade + 难度存档（diff 形状与 Task 6 的 bestRecordText 兼容）
vi.mock('./saveData.js', () => ({
  getSave: () => ({ gold: 300, gems: 10, soulJade: 3, diff: { unlocked: ['easy'], endlessFloor: 1, best: {}, selected: { id: 'easy' } } }),
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

describe('HomeScene currency bar', () => {
  it('shows gold, gems, and soul jade', () => {
    const scene = new HomeScene({ switch: () => {} });
    const ctx = stubCanvas();
    scene.render(ctx);
    const texts = ctx.calls.map((c) => c.text).filter(Boolean).map(String);
    expect(texts.some((t) => t.includes('金币 300'))).toBe(true);
    expect(texts.some((t) => t.includes('宝石 10'))).toBe(true);
    expect(texts.some((t) => t.includes('魂玉 3'))).toBe(true);
  });
});
