// Canvas 通用按钮
export class Button {
  constructor(x, y, w, h, label, onClick, opts = {}) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.label = label;
    this.onClick = onClick;
    this.opts = opts; // { bg, fg, fontSize, disabled, sub }
  }

  hitTest(x, y) {
    return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
  }

  draw(ctx) {
    const { bg = '#5a3a28', fg = '#f0d8a8', fontSize = 30, disabled = false, sub = '' } = this.opts;
    ctx.save();
    ctx.fillStyle = disabled ? '#3a3330' : bg;
    ctx.strokeStyle = disabled ? '#555' : '#c9a86a';
    ctx.lineWidth = 2;
    roundRect(ctx, this.x, this.y, this.w, this.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = disabled ? '#888' : fg;
    ctx.font = `${fontSize}px KaiTi, STKaiti, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, this.x + this.w / 2, this.y + this.h / 2 - (sub ? 12 : 0));
    if (sub) {
      ctx.font = `20px KaiTi, STKaiti, serif`;
      ctx.fillText(sub, this.x + this.w / 2, this.y + this.h / 2 + 20);
    }
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
