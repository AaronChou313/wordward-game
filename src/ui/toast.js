// 轻提示
let toasts = [];

export const Toast = {
  show(text) { toasts.push({ text, life: 2.0 }); },
  update(dt) {
    for (const t of toasts) t.life -= dt;
    toasts = toasts.filter((t) => t.life > 0);
  },
  render(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    toasts.forEach((t, i) => {
      const alpha = Math.min(1, t.life);
      const y = 640 - i * 56;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(20, 14, 10, 0.9)';
      ctx.font = '28px KaiTi, STKaiti, serif';
      const w = ctx.measureText(t.text).width + 48;
      ctx.fillRect(375 - w / 2, y - 26, w, 52);
      ctx.strokeStyle = '#c9a86a';
      ctx.strokeRect(375 - w / 2, y - 26, w, 52);
      ctx.fillStyle = '#f0d8a8';
      ctx.fillText(t.text, 375, y);
    });
    ctx.restore();
  },
};
