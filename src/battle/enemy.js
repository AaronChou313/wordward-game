// 怪物：沿路径移动，到达终点扣主公生命
import { pointAt, speedPx, PATH_TOTAL } from './path.js';

let nextId = 1;

export class Enemy {
  constructor(hp, speedCells) {
    this.id = nextId++;
    this.maxHp = hp;
    this.hp = hp;
    this.speed = speedPx(speedCells);
    this.dist = 0;
    this.x = 0; this.y = 0;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.dead = false;
    this.reached = false;
  }

  update(dt) {
    if (this.slowTimer > 0) this.slowTimer -= dt;
    const factor = this.slowTimer > 0 ? this.slowFactor : 1;
    this.dist += this.speed * factor * dt;
    const p = pointAt(this.dist);
    this.x = p.x; this.y = p.y;
    if (p.done) this.reached = true;
  }

  takeDamage(n) {
    this.hp -= n;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  // 进度（用于寻敌优先级：越接近主公越优先）
  get progress() { return this.dist / PATH_TOTAL; }

  render(ctx) {
    ctx.save();
    const r = 26;
    ctx.fillStyle = '#5a4a6a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2033';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#c0b0d8';
    ctx.font = 'bold 30px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('贼', this.x, this.y + 1);
    if (this.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(120, 200, 220, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 血条
    const w = 44;
    ctx.fillStyle = '#222';
    ctx.fillRect(this.x - w / 2, this.y - r - 12, w, 6);
    ctx.fillStyle = '#d84a3a';
    ctx.fillRect(this.x - w / 2, this.y - r - 12, w * Math.max(0, this.hp / this.maxHp), 6);
    ctx.restore();
  }
}
