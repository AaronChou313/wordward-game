// 将士实体：基础兵 / 进阶字（惰性）/ 英雄
import { BASE_UNITS, ADV_CHARS, tierAtkMul, tierIntervalMul, levelAtkMul, levelIntervalMul, xpForLevel } from '../config/units.js';
import { HEROES } from '../config/words.js';
import { CELL, cellCenter } from '../config/map.js';
import { Audio } from '../core/audio.js';

export class Tower {
  // kind: 'base' | 'adv' | 'hero'；heroName 仅英雄用
  constructor(char, tier, c, r, kind, heroName) {
    this.char = char;
    this.tier = tier;
    this.level = 1;
    this.xp = 0;
    this.c = c; this.r = r;
    this.kind = kind;
    this.heroName = heroName || null;
    this.cool = 0;
    this.stunTimer = 0;
    this.stunImmuneTimer = 0;
    this.buffs = {};       // 词组强化效果（每轮扫描重算）
    this.buffChars = [];   // 生效中的强化字（显示用）
    this.auraSpd = 0;      // 光环攻速（曹操等，每帧重算）
    this.flash = 0;        // 强化提示闪烁
    this.group = null;     // 所属英雄组（HeroGroup），未入组为 null
    const pos = cellCenter(c, r);
    this.x = pos.x; this.y = pos.y;
  }

  get base() {
    if (this.kind === 'hero') return HEROES[this.heroName];
    return BASE_UNITS[this.char] || null;
  }

  get inert() {
    return this.kind === 'adv'; // 进阶字单独放置不生效
  }

  // itemBuffs: { atk, spd } 被动道具+玩家装备；weaponBuff: 该兵种佩戴的武器加成
  stats(itemBuffs, weaponBuff) {
    const b = this.base;
    if (!b) return null;
    const w = weaponBuff || {};
    const dmgMul = 1 + (this.buffs.damage || 0) + (itemBuffs.atk || 0) + (w.atk || 0);
    const spdMul = 1 + (this.buffs.atkSpeed || 0) + (itemBuffs.spd || 0) + this.auraSpd + (w.spd || 0);
    return {
      atk: b.atk * tierAtkMul(this.tier) * levelAtkMul(this.level) * dmgMul,
      interval: Math.max(0.15, b.interval * tierIntervalMul(this.tier) * levelIntervalMul(this.level) / spdMul),
      range: b.range * (1 + (this.buffs.range || 0) + (w.range || 0)),
      aoe: (b.aoe || 0) * (1 + (this.buffs.aoe || 0)),
      atkType: b.atkType,
      crit: (this.buffs.crit || 0) + (w.crit || 0),
      critMul: this.buffs.critMul || 2,
      slowAura: this.buffs.slowAura || 0,
      skill: b.skill || null,
    };
  }

  gainXp(n) {
    this.xp += n;
    let leveled = false;
    while (this.xp >= xpForLevel(this.level) && this.level < 20) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      leveled = true;
    }
    return leveled;
  }

  applyStun(duration) {
    if (this.stunTimer > 0 || this.stunImmuneTimer > 0) return false;
    this.stunTimer = duration;
    return true;
  }

  // 返回击杀数；onKill(enemy, tower) 回调用于刷新栏加速等
  update(dt, ctx2) {
    const { enemies, effects, itemBuffs, onKill } = ctx2;
    const stun = advanceStunTimers(this, dt);
    this.stunTimer = stun.stunTimer;
    this.stunImmuneTimer = stun.stunImmuneTimer;
    if (this.flash > 0) this.flash -= dt;
    if (stun.stunned) return 0;
    if (this.inert) return 0;
    const wb = ctx2.unitGear ? ctx2.unitGear[this.char] : null;
    const s = this.stats(itemBuffs, wb);
    if (!s) return 0;
    this.cool -= dt;

    // 谋·减速光环：持续作用于范围内敌人
    if (s.slowAura > 0) {
      const rr = s.range * CELL;
      for (const e of enemies) {
        if (!e.dead && dist(this, e) <= rr) {
          e.slowTimer = 0.3;
          e.slowFactor = 1 - s.slowAura;
        }
      }
    }

    if (this.cool > 0) return 0;

    const target = pickTarget(this, enemies, s);
    if (!target) return 0;
    this.cool = s.interval;

    let dmg = s.atk;
    let crit = false;
    if (s.crit > 0 && Math.random() < s.crit) { dmg *= s.critMul; crit = true; }

    const kills = this.attack(s, target, dmg, crit, enemies, effects, onKill, ctx2);
    return kills;
  }

  attack(s, target, dmg, crit, enemies, effects, onKill, ctx2) {
    const rangePx = s.range * CELL;
    const aoePx = s.aoe * CELL;
    const hurt = (e, d) => {
      if (e.dead) return;
      const died = e.takeDamage(d);
      effects.damageText(e.x, e.y - 30, String(Math.round(d)), crit ? '#ff9a3a' : '#ffdf6a', crit ? 34 : 26);
      if (died) {
        effects.burst(e.x, e.y, '#8a6aa8', 14);
        Audio.kill();
        onKill(e, this);
      }
    };

    switch (s.atkType) {
      case 'single': {
        Audio.hit();
        effects.tracer(this.x, this.y, target.x, target.y, '#ffe9b0');
        if (dist(this, target) < 1.6 * CELL) effects.slash(target.x, target.y, Math.random() * Math.PI, 40);
        hurt(target, dmg);
        break;
      }
      case 'circle': {
        Audio.hit();
        effects.slash(this.x, this.y, Math.atan2(target.y - this.y, target.x - this.x), rangePx);
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - target.x, e.y - target.y) <= aoePx) hurt(e, dmg);
        }
        break;
      }
      case 'line': {
        Audio.hit();
        const dx = target.x - this.x, dy = target.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        const ex = this.x + nx * rangePx, ey = this.y + ny * rangePx;
        effects.tracer(this.x, this.y, ex, ey, '#cfe4ff');
        for (const e of enemies) {
          if (e.dead) continue;
          const px = e.x - this.x, py = e.y - this.y;
          const proj = px * nx + py * ny;
          if (proj < 0 || proj > rangePx) continue;
          const perp = Math.abs(px * ny - py * nx);
          if (perp <= 0.45 * CELL) hurt(e, dmg);
        }
        break;
      }
      case 'aoe': {
        Audio.boom();
        effects.ring(target.x, target.y, '#ff8a4a');
        effects.burst(target.x, target.y, '#e05a3a', 18, 340);
        effects.shake(6, 0.15);
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - target.x, e.y - target.y) <= aoePx) hurt(e, dmg);
        }
        break;
      }
      case 'chain': { // 诸葛亮：全屏落雷
        Audio.boom();
        effects.shake(4, 0.12);
        for (const e of enemies) {
          if (e.dead) continue;
          effects.tracer(e.x, 0, e.x, e.y, '#c9a8ff');
          hurt(e, dmg);
        }
        break;
      }
    }

    // 英雄技能附加效果
    if (s.skill === 'charm') {
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - target.x, e.y - target.y) <= aoePx) {
          e.slowTimer = 1.5; e.slowFactor = 0.5;
        }
      }
    }
    if (s.skill === 'roar') effects.shake(5, 0.12);
    return 0;
  }

  render(ctx) {
    ctx.save();
    const b = this.base;
    const advStyle = this.kind === 'adv' ? (ADV_CHARS[this.char] || {}) : {};
    const color = this.kind === 'hero' ? b.color : (b ? b.color : advStyle.color || '#e8c35a');

    // 底座
    ctx.fillStyle = this.kind === 'hero' ? 'rgba(90, 60, 20, 0.9)' : 'rgba(40, 30, 20, 0.85)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = this.kind === 'hero' ? 4 : 2;
    ctx.stroke();

    if (this.kind === 'hero') {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = this.inert ? shade(color, 0.55) : color;
    ctx.font = `bold ${this.kind === 'hero' ? 40 : 46}px KaiTi, STKaiti, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.char, this.x, this.y + 2);
    ctx.shadowBlur = 0;

    // 阶数徽标（右上角）
    if (this.tier > 1) {
      ctx.fillStyle = '#e8c35a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ'[Math.min(this.tier, 10) - 1], this.x + 26, this.y - 26);
    }
    // 等级（左下角）
    ctx.fillStyle = '#a8d8a0';
    ctx.font = '18px sans-serif';
    ctx.fillText('Lv' + this.level, this.x - 24, this.y + 28);

    // 强化词提示
    if (this.buffChars.length > 0) {
      ctx.fillStyle = '#ffe9a0';
      ctx.font = '18px KaiTi, STKaiti, serif';
      ctx.fillText(this.buffChars.join(''), this.x, this.y - 44);
    }
    this.renderStunStatus(ctx);
    ctx.restore();
  }

  renderStunStatus(ctx) {
    if (this.stunTimer <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(38, 55, 88, 0.82)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 39, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8ed8ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#e8f7ff';
    ctx.font = 'bold 20px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('晕 ' + this.stunTimer.toFixed(1), this.x, this.y);
    ctx.restore();
  }
}

export function advanceStunTimers(state, dt) {
  const epsilon = 1e-9;
  let stunTimer = Math.max(0, state.stunTimer);
  let stunImmuneTimer = Math.max(0, state.stunImmuneTimer);
  let remaining = Math.max(0, dt);

  if (stunTimer > epsilon) {
    if (remaining + epsilon < stunTimer) {
      stunTimer -= remaining;
      remaining = 0;
    } else {
      remaining = Math.max(0, remaining - stunTimer);
      stunTimer = 0;
      stunImmuneTimer = Math.max(stunImmuneTimer, 2);
    }
  }

  if (stunTimer <= epsilon && remaining > epsilon) {
    stunImmuneTimer = Math.max(0, stunImmuneTimer - remaining);
  }

  return {
    stunTimer: stunTimer <= epsilon ? 0 : stunTimer,
    stunImmuneTimer: stunImmuneTimer <= epsilon ? 0 : stunImmuneTimer,
    stunned: stunTimer > epsilon,
  };
}

function dist(t, e) {
  return Math.hypot(e.x - t.x, e.y - t.y);
}

// 优先攻击最接近主公的敌人
function pickTarget(t, enemies, s) {
  const rr = s.range * CELL;
  let best = null;
  for (const e of enemies) {
    if (e.dead || e.reached) continue;
    if (dist(t, e) > rr) continue;
    if (!best || e.progress > best.progress) best = e;
  }
  return best;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
