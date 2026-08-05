import { describe, expect, it } from 'vitest';
import { HelpScene } from './helpScene.js';

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

describe('HelpScene', () => {
  it('renders the four gameplay sections', () => {
    const scene = new HelpScene({ switch: () => {} });
    const ctx = stubCanvas();
    scene.render(ctx);
    const texts = ctx.calls.map((c) => c.text).filter(Boolean).map(String);
    for (const section of ['基本将士', '刷新与铲子', '军功与进阶', '装备与货币']) {
      expect(texts.some((t) => t.includes(section))).toBe(true);
    }
  });

  it('scrolls the content', () => {
    const scene = new HelpScene({ switch: () => {} });
    scene.onPointerDown(375, 900);
    scene.onPointerMove(375, 700);
    scene.onPointerUp(375, 700);
    expect(scene.scroll).toBeGreaterThan(0);
  });
});
