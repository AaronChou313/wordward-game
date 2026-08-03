// 战斗特效：粒子、飘字、震屏、刀光、弹道线，全部程序化绘制
export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.tracers = [];
    this.slashes = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
  }

  shake(mag, time) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  burst(x, y, color, count = 12, speed = 260) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        size: 3 + Math.random() * 4, color,
      });
    }
  }

  ring(x, y, color, count = 20, speed = 320) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.5, maxLife: 0.5, size: 5, color,
      });
    }
  }

  damageText(x, y, text, color = '#ffdf6a', size = 28) {
    this.texts.push({ x, y, text, color, size, life: 0.8, maxLife: 0.8 });
  }

  tracer(x1, y1, x2, y2, color) {
    this.tracers.push({ x1, y1, x2, y2, color, life: 0.12, maxLife: 0.12 });
  }

  slash(x, y, angle, range, color = '#fff2d0') {
    this.slashes.push({ x, y, angle, range, color, life: 0.18, maxLife: 0.18 });
  }

  update(dt) {
    if (this.shakeTime > 0) this.shakeTime -= dt;
    else this.shakeMag = 0;
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 60 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);
  }

  getShakeOffset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * 2 * this.shakeMag,
      y: (Math.random() - 0.5) * 2 * this.shakeMag,
    };
  }

  render(ctx) {
    ctx.save();
    for (const tr of this.tracers) {
      ctx.globalAlpha = tr.life / tr.maxLife;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
    for (const s of this.slashes) {
      const t = s.life / s.maxLife;
      ctx.globalAlpha = t;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 8 * t + 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.range * (1.2 - t * 0.2), s.angle - 0.9, s.angle + 0.9);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = t.life / t.maxLife;
      ctx.font = `bold ${t.size}px KaiTi, STKaiti, serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
