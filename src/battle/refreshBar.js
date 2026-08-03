// 刷新栏：5 格，冷却 30s 起、每次 +10s、击杀 -5s，概率掉铲子（含保底）
import { REFRESH_BASE_CD, REFRESH_CD_STEP, KILL_CD_REDUCE, REFRESH_SLOTS, SHOVEL_DROP_CHANCE, SHOVEL_PITY } from '../config/economy.js';
import { BASE_WEIGHTS, ADV_CHARS } from '../config/units.js';
import { advCharChance } from '../config/waves.js';

export class RefreshBar {
  constructor(unlockedChars, diff) {
    this.slots = new Array(REFRESH_SLOTS).fill(null); // { char, kind, tier, level, xp }
    this.unlockedChars = unlockedChars;
    this.diff = diff || null;
    this.cool = 0;
    this.coolMax = REFRESH_BASE_CD;
    this.refreshCount = 0;
    this.shovels = 0;
    this.sinceShovel = 0;
    this.wave = 0;
  }

  get ready() { return this.cool <= 0; }

  update(dt) {
    if (this.cool > 0) this.cool -= dt;
  }

  onKill() {
    if (this.cool > 0) this.cool = Math.max(0, this.cool - KILL_CD_REDUCE);
  }

  pullOne() {
    const advChance = advCharChance(this.wave, this.diff);
    if (this.unlockedChars.length > 0 && Math.random() < advChance) {
      const char = this.unlockedChars[Math.floor(Math.random() * this.unlockedChars.length)];
      return { char, kind: 'adv', tier: 1, level: 1, xp: 0 };
    }
    let total = 0;
    for (const k in BASE_WEIGHTS) total += BASE_WEIGHTS[k];
    let roll = Math.random() * total;
    for (const k in BASE_WEIGHTS) {
      roll -= BASE_WEIGHTS[k];
      if (roll <= 0) return { char: k, kind: 'base', tier: 1, level: 1, xp: 0 };
    }
    return { char: '兵', kind: 'base', tier: 1, level: 1, xp: 0 };
  }

  // 刷新全部 5 格；force 用于募兵令
  refresh(force = false) {
    if (!force && !this.ready) return false;
    for (let i = 0; i < REFRESH_SLOTS; i++) this.slots[i] = this.pullOne();
    this.refreshCount++;
    this.coolMax = REFRESH_BASE_CD + REFRESH_CD_STEP * this.refreshCount;
    this.cool = this.coolMax;
    this.sinceShovel++;
    const chance = SHOVEL_DROP_CHANCE + (this.diff ? this.diff.shovelAdd : 0);
    if (Math.random() < chance || this.sinceShovel > SHOVEL_PITY) {
      this.shovels++;
      this.sinceShovel = 0;
    }
    return true;
  }

  initialFill() {
    for (let i = 0; i < REFRESH_SLOTS; i++) this.slots[i] = this.pullOne();
  }

  take(i) {
    const item = this.slots[i];
    if (item) this.slots[i] = null;
    return item;
  }

  putBack(i, item) {
    if (!this.slots[i]) this.slots[i] = item;
  }

  get empty() {
    return this.slots.every((s) => s === null);
  }
}

export { ADV_CHARS };
