// 怪物：沿路径移动，到达终点扣主公生命
import { pointAt, speedPx, PATH_TOTAL } from './path.js';
import { CELL } from '../config/map.js';

let nextId = 1;

export class Enemy {
  constructor(hp, speedCells) {
    const descriptor = typeof hp === 'object' ? hp : null;
    const enemyHp = descriptor ? descriptor.hp : hp;
    const enemySpeed = descriptor ? descriptor.speed : speedCells;
    this.id = descriptor ? descriptor.id : nextId++;
    this.type = descriptor ? descriptor.type : 'normal';
    this.name = descriptor ? descriptor.name : '流寇';
    this.skill = descriptor ? descriptor.skill : null;
    this.skillCooldown = this.skill ? this.skill.cooldown : 0;
    this.skillTelegraphTimer = 0;
    this.scale = descriptor ? descriptor.scale : 1;
    this.color = descriptor ? descriptor.color : '#5a4a6a';
    this.maxHp = enemyHp;
    this.hp = enemyHp;
    this.speed = speedPx(enemySpeed);
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
    const r = 26 * this.scale;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2033';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = this.type === 'normal' ? '#c0b0d8' : '#fff0c4';
    ctx.font = 'bold ' + Math.round(30 * this.scale) + 'px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.type === 'boss' ? '王' : (this.type === 'elite' ? '将' : '贼'), this.x, this.y + 1);
    if (this.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(120, 200, 220, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.skillTelegraphTimer > 0 && this.skill) {
      const progress = 1 - this.skillTelegraphTimer / this.skill.telegraph;
      ctx.strokeStyle = '#ffdf6a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.fillStyle = '#fff0b0';
      ctx.font = 'bold 18px KaiTi, STKaiti, serif';
      ctx.fillText('蓄 ' + this.skillTelegraphTimer.toFixed(1), this.x, this.y + r + 23);
    }
    // 血条
    const w = 44 * this.scale;
    ctx.fillStyle = '#222';
    ctx.fillRect(this.x - w / 2, this.y - r - 12, w, 6);
    ctx.fillStyle = '#d84a3a';
    ctx.fillRect(this.x - w / 2, this.y - r - 12, w * Math.max(0, this.hp / this.maxHp), 6);
    if (this.type !== 'normal') {
      ctx.fillStyle = '#f4d9a2';
      ctx.font = 'bold 18px KaiTi, STKaiti, serif';
      ctx.fillText(this.name, this.x, this.y - r - 25);
    }
    ctx.restore();
  }
}

export function selectStunTargets(enemy, towers, skill, rangeOfTower = baseRange) {
  const living = towers.filter((tower) => !tower.dead);
  if (skill.kind === 'near-stun') {
    const radius = skill.range * CELL;
    return living.filter((tower) => Math.hypot(tower.x - enemy.x, tower.y - enemy.y) <= radius);
  }
  if (skill.kind === 'ranged-stun') {
    return living.filter((tower) => rangeOfTower(tower) >= skill.range);
  }
  return [];
}

export function advanceSkillTimer(state, skill, dt) {
  if (state.telegraph > 0) {
    const remaining = state.telegraph - dt;
    const telegraph = remaining <= 1e-9 ? 0 : remaining;
    if (telegraph === 0) {
      return { cooldown: skill.cooldown, telegraph: 0, fired: true };
    }
    return { cooldown: state.cooldown, telegraph, fired: false };
  }

  const cooldown = Math.max(0, state.cooldown - dt);
  if (cooldown === 0) {
    return { cooldown: 0, telegraph: skill.telegraph, fired: false };
  }
  return { cooldown, telegraph: 0, fired: false };
}

function baseRange(tower) {
  return tower.base ? tower.base.range : 0;
}
