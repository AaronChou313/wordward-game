// 怪物：沿路径移动，到达终点扣主公生命
import { pointAt, speedPx, PATH_TOTAL } from './path.js';
import { CELL } from '../config/map.js';
import { BLOCKING } from '../config/units.js';
import { blockDamage } from './blocking.js';

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
    this.blocker = null;
    this.blockAttackTimer = BLOCKING.attackInterval;
    this.blockAttackFlash = 0;
  }

  setBlocker(blocker) {
    if (this.blocker === blocker) return;
    this.blocker = blocker;
    this.blockAttackTimer = BLOCKING.attackInterval;
  }

  releaseFromBlocker(expected = null) {
    if (expected && this.blocker !== expected) return false;
    if (!this.blocker) return false;
    this.blocker = null;
    return true;
  }

  update(dt, context = {}) {
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.blockAttackFlash > 0) this.blockAttackFlash -= dt;
    if (context.holdPosition && !this.blocker) return;
    if (this.blocker && this.blocker.blocking && !this.blocker.dead) {
      this.blockAttackTimer -= dt;
      while (this.blockAttackTimer <= 1e-9 && this.blocker && !this.blocker.dead) {
        const blocker = this.blocker;
        const damage = blockDamage(this);
        this.blockAttackTimer += BLOCKING.attackInterval;
        this.blockAttackFlash = 0.16;
        const died = blocker.takeBlockDamage(damage);
        if (context.onBlockHit) context.onBlockHit(this, blocker, damage);
        if (died && context.onBlockerDeath) context.onBlockerDeath(blocker);
      }
      return;
    }
    if (this.blocker) this.releaseFromBlocker();
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
    if (this.blockAttackFlash > 0) {
      ctx.strokeStyle = '#ffb15c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 7, -0.75 * Math.PI, 0.15 * Math.PI);
      ctx.stroke();
    }
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
  const epsilon = 1e-9;
  let cooldown = Math.max(0, state.cooldown);
  let telegraph = Math.max(0, state.telegraph);
  let remaining = Math.max(0, dt);
  let fired = false;

  if (cooldown <= epsilon && telegraph <= epsilon) telegraph = skill.telegraph;

  while (remaining > epsilon) {
    if (telegraph > epsilon) {
      if (remaining + epsilon < telegraph) {
        telegraph -= remaining;
        remaining = 0;
      } else {
        remaining = Math.max(0, remaining - telegraph);
        telegraph = 0;
        cooldown = skill.cooldown;
        fired = true;
      }
      continue;
    }

    if (cooldown > epsilon) {
      if (remaining + epsilon < cooldown) {
        cooldown -= remaining;
        remaining = 0;
      } else {
        remaining = Math.max(0, remaining - cooldown);
        cooldown = 0;
        telegraph = skill.telegraph;
      }
      continue;
    }

    telegraph = skill.telegraph;
  }

  return {
    cooldown: cooldown <= epsilon ? 0 : cooldown,
    telegraph: telegraph <= epsilon ? 0 : telegraph,
    fired,
  };
}

function baseRange(tower) {
  return tower.base ? tower.base.range : 0;
}
