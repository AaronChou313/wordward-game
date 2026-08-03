// 面板绘制：复古边框
import { roundRect } from './button.js';

export function drawPanel(ctx, x, y, w, h, title) {
  ctx.save();
  ctx.fillStyle = 'rgba(24, 18, 14, 0.96)';
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#7a5a38';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 10);
  ctx.stroke();
  if (title) {
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '40px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + w / 2, y + 22);
  }
  ctx.restore();
}
