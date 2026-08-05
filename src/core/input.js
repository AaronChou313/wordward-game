// 输入：触摸/鼠标统一为设计分辨率坐标下的点选/拖拽
import { isCanvasTextInputActive, subscribeCanvasTextInputState } from '../ui/canvasTextInput.js';

export const DESIGN_W = 750;
export const DESIGN_H = 1334;

export function setupInput(canvas, handler) {
  const state = { scale: 1, offsetX: 0, offsetY: 0 };

  function resize() {
    if (isCanvasTextInputActive()) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    state.scale = Math.min(w / DESIGN_W, h / DESIGN_H);
    state.offsetX = (w - DESIGN_W * state.scale) / 2;
    state.offsetY = (h - DESIGN_H * state.scale) / 2;
    state.dpr = dpr;
  }
  window.addEventListener('resize', resize);
  subscribeCanvasTextInputState((active) => {
    if (!active) resize();
  });
  resize();

  function toDesign(clientX, clientY) {
    return {
      x: (clientX - state.offsetX) / state.scale,
      y: (clientY - state.offsetY) / state.scale,
    };
  }

  let down = false;
  function onDown(cx, cy) { down = true; const p = toDesign(cx, cy); handler.pointerDown(p.x, p.y); }
  function onMove(cx, cy) { if (!down) return; const p = toDesign(cx, cy); handler.pointerMove(p.x, p.y); }
  function onUp(cx, cy) { if (!down) return; down = false; const p = toDesign(cx, cy); handler.pointerUp(p.x, p.y); }

  canvas.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', (e) => onUp(e.clientX, e.clientY));

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; onDown(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.changedTouches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); const t = e.changedTouches[0]; onUp(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener('touchcancel', (e) => { e.preventDefault(); const t = e.changedTouches[0]; onUp(t.clientX, t.clientY); }, { passive: false });

  return state; // render 时用于设置 transform
}
