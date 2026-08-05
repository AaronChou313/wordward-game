// 战斗场景：编排地图、刷怪、将士、英雄组、刷新栏、词组、道具、结算
import { Grid } from './grid.js';
import { advanceSkillTimer, applySlowEffect, Enemy, selectStunTargets } from './enemy.js';
import { spawnPlan } from './spawnPlan.js';
import { Tower } from './tower.js';
import { HeroGroup } from './heroGroup.js';
import { RefreshBar } from './refreshBar.js';
import { createCharPool } from './charPool.js';
import { rescan } from './wordSystem.js';
import { canMerge, mergeBarItem, mergeInto } from './merge.js';
import { Effects } from './effects.js';
import { Score } from './score.js';
import { pointAt } from './path.js';
import { LORD_HP, WAVE_REST, FIRST_WAVE_DELAY, waveConfig } from '../config/waves.js';
import { resolveDiff } from '../config/difficulty.js';
import { claimBossCompletion, isBossWave } from './progression.js';
import { assignBlockers } from './blocking.js';
import { pointToCell, cellCenter, CELL, COLS, ROWS } from '../config/map.js';
import { BASE_UNITS, ADV_CHARS } from '../config/units.js';
import { HEROES, PREFIX_BUFFS, HERO_NAMES } from '../config/words.js';
import { ITEMS, MAX_ACTIVE } from '../config/items.js';
import { EQUIP, equipStats, dropChance, rollRarity, rollEquipId, rarityById } from '../config/equipment.js';
import { applyBondStats } from './bond.js';
import { CODEX_SET_BONUS, codexCat } from '../config/codex.js';
import { Button, roundRect } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { getSave, addGold, addGems, addSoulJade, persist, grantEquip, equipByUid } from '../meta/saveData.js';
import { recordCodexEncounter } from '../meta/codexDetails.js';
import { refreshShopAfterBattle } from '../meta/shopStock.js';
import { buildMeritClaim, queueMeritClaim } from '../net/meritClient.js';

// 顶部按钮行
const TOP_Y = 64, TOP_H = 56;
const ACT_W = 132, ACT_GAP = 8, ACT_X = 39;
// 刷新栏布局
const SLOT_Y = 1178, SLOT_H = 84, SLOT_W = 120, SLOT_GAP = 8, SLOT_X = 39;
const BTN_Y = 1268, BTN_H = 64;
export const BATTLE_BAR_LAYOUT = Object.freeze({
  slotY: SLOT_Y,
  slotHeight: SLOT_H,
  buttonY: BTN_Y,
  buttonHeight: BTN_H,
});
// 拖拽判定阈值（小于此位移视为点选）
const TAP_DIST = 14;
// 设置面板音量滑条
const SLIDER_X = 215, SLIDER_W = 320, SLIDER_Y = 600;

export const ACTIVE_ITEM_HANDLERS = {
  'damage-all': (scene, active, item) => {
    const damage = item.effect.damageAt(active.level);
    for (const enemy of scene.enemies) {
      if (enemy.dead) continue;
      scene.effects.tracer(enemy.x, enemy.y - 80, enemy.x, enemy.y, '#ff7a3a');
      if (enemy.takeDamage(damage)) scene.handleKill(enemy, null);
    }
    scene.effects.shake(8, 0.25);
    return { used: true, message: `${item.name}：全屏灼烧！`, sound: 'boom' };
  },
  'refresh-bar': (scene, _active, item) => {
    scene.bar.refresh(true);
    return { used: true, message: `${item.name}：将士栏已刷新`, sound: 'click' };
  },
  'promote-target': (scene, _active, item, target) => {
    if (!target) return { used: false, message: '请拖到将士身上使用' };
    target.tier += item.effect.tiers;
    target.cool = 0;
    target.refillBlocker();
    scene.effects.ring(target.x, target.y, '#7fe08a', 16, 280);
    scene.effects.damageText(target.x, target.y - 56, target.tier + ' 阶!', '#7fe08a', 30);
    scene.afterBoardChange();
    return { used: true, message: `${item.name}：${target.char} 升至 ${target.tier} 阶`, sound: 'merge' };
  },
  'fill-empty-bar': (scene, _active, item) => {
    const filled = scene.bar.fillEmpty();
    if (filled === 0) return { used: false, message: '将士栏没有空位' };
    return { used: true, message: `${item.name}：补充 ${filled} 名将士`, sound: 'click' };
  },
  'slow-all': (scene, active, item) => {
    const enemies = scene.enemies.filter((enemy) => !enemy.dead);
    if (enemies.length === 0) return { used: false, message: '当前没有可减速的敌军' };
    const duration = item.effect.durationAt(active.level);
    const factor = item.effect.factorAt(active.level);
    for (const enemy of enemies) {
      applySlowEffect(enemy, 'warDrum', duration, factor);
    }
    return { used: true, message: `${item.name}：敌军行动迟滞`, sound: 'boom' };
  },
  'damage-strongest': (scene, active, item) => {
    const alive = scene.enemies.filter((enemy) => !enemy.dead);
    if (alive.length === 0) return { used: false, message: '当前没有敌军' };
    const target = alive.reduce((max, e) => (e.hp > max.hp ? e : max));
    const damage = item.effect.damageAt(active.level);
    scene.effects.tracer(target.x, target.y - 80, target.x, target.y, '#ffd75a');
    if (target.takeDamage(damage)) scene.handleKill(target, null);
    scene.effects.damageText(target.x, target.y - 48, '-' + damage, '#ffd75a', 30);
    scene.effects.shake(6, 0.18);
    return { used: true, message: `${item.name}：雷击最强者`, sound: 'boom' };
  },
  'heal-lord': (scene, active, item) => {
    const heal = item.effect.healAt(active.level);
    scene.lordHp = Math.min(scene.lordHpMax(), scene.lordHp + heal);
    scene.effects.damageText(375, 120, '+' + heal, '#7fe08a', 30);
    scene.effects.ring(375, 120, '#7fe08a', 20, 260);
    return { used: true, message: `${item.name}：主公回复 ${heal} 生命`, sound: 'click' };
  },
  'summon-random': (scene, _active, item) => {
    const chars = Object.keys(BASE_UNITS);
    const char = chars[Math.floor(Math.random() * chars.length)];
    const placed = scene.tryPlaceChar(char);
    if (!placed) return { used: false, message: '没有可放置的位置' };
    return { used: true, message: `${item.name}：召唤「${char}」`, sound: 'merge' };
  },
};

export function dispatchActiveItem(scene, active, target = null) {
  if (!active || active.cd > 0) return { used: false, message: '道具仍在冷却' };
  const item = ITEMS[active.id];
  const handler = item && item.kind === 'active' && item.effect
    ? ACTIVE_ITEM_HANDLERS[item.effect.type]
    : null;
  if (!handler) return { used: false, message: '道具效果不可用' };
  const result = handler(scene, active, item, target);
  if (result.used) active.cd = item.cooldownAt(active.level);
  return result;
}

// 将士武器槽位键解析：英雄组/英雄傀儡用英雄全名（group.name / heroName），基础/进阶字用其单字符
export function gearKeyFor(tower) {
  if (tower.group) return tower.group.name;
  if (tower.kind === 'hero' && tower.heroName) return tower.heroName;
  return tower.char;
}

export function aggregatePassiveItemBuffs(equipped) {
  const aggregate = {};
  for (const entry of equipped || []) {
    const item = ITEMS[entry.id];
    if (!item || item.kind !== 'passive' || !item.buffs) continue;
    const buffs = item.buffs(entry.level);
    for (const [key, value] of Object.entries(buffs)) {
      aggregate[key] = (aggregate[key] || 0) + value;
    }
  }
  return aggregate;
}

export function stunDurationAfterBuffs(duration, itemBuffs = {}) {
  return Math.max(0, duration * (1 - (itemBuffs.stunDuration || 0)));
}

export function normalizeActiveItems(equipped, owned = {}) {
  const normalized = [];
  const seen = new Set();
  for (const entry of equipped || []) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    const item = ITEMS[id];
    const ownedLevel = owned[id];
    if (seen.has(id) || !item || item.kind !== 'active' || !Number.isFinite(ownedLevel) || ownedLevel < 1) continue;
    seen.add(id);
    normalized.push({ id, level: Math.floor(ownedLevel), cd: 0 });
    if (normalized.length >= MAX_ACTIVE) break;
  }
  return normalized;
}

export class BattleScene {
  constructor(scenes) {
    this.scenes = scenes;
  }

  enter() {
    const save = getSave();
    this.diff = resolveDiff(save.diff.selected);
    this.grid = new Grid();
    this.towers = [];
    this.heroGroups = [];
    this.enemies = [];
    this.effects = new Effects();
    this.score = new Score();
    this.paused = false;
    this.speed = 1;
    this.over = false;
    this.settingsOpen = false;
    this.campOpen = false;
    this.volumeDragging = false;
    this.selected = null;  // Tower 或 HeroGroup
    this.elapsed = 0;
    this.runId = createRunId();
    this.runSeed = createRunSeed();
    this.runStartedAt = new Date();
    this.drag = null;      // { source:'slot'|'tower'|'active'|'shovel', index?, tower?, id?, char, kind, x, y, downX, downY, moved }
    this.pointer = { x: 0, y: 0 };

    // 被动道具加成
    this.itemBuffs = aggregatePassiveItemBuffs(save.items.equippedPassive);

    // 玩家装备加成（全军/主公）
    this.lordHpBonus = 0;
    for (const slot in save.equipment.player) {
      const inst = equipByUid(save.equipment.player[slot]);
      if (!inst) continue;
      const s = equipStats(inst);
      for (const k in s) {
        if (k === 'lordHp') this.lordHpBonus += s[k];
        else this.itemBuffs[k] = (this.itemBuffs[k] || 0) + s[k];
      }
    }

    // 装备套装羁绊（2 件 / 3 件）并入战斗加成与主公生命
    const bonds = applyBondStats(this.itemBuffs, save.equipment.player, save.equipment.owned);
    this.itemBuffs = bonds;
    this.lordHpBonus += bonds.lordHp || 0;
    this.lordHp = LORD_HP + Math.round(this.lordHpBonus);

    // 将士武器（按兵种）
    this.unitGear = {};
    for (const char in save.equipment.units) {
      const inst = equipByUid(save.equipment.units[char]);
      if (inst) this.unitGear[char] = equipStats(inst);
    }

    // 主动道具
    this.actives = normalizeActiveItems(save.items.equippedActive, save.items.owned);

    // 刷新栏
    this.charPool = createCharPool(save.unlockedChars);
    this.bar = new RefreshBar(save.unlockedChars, this.diff, this.charPool);
    this.bar.initialFill();

    // 波次状态（开局留准备时间）
    this.wave = 0;
    this.waveState = 'rest';
    this.restTimer = FIRST_WAVE_DELAY;
    this.toSpawn = 0;
    this.spawnQueue = [];
    this.spawnIndex = 0;
    this.spawnTimer = 0;
    this.waveCfg = null;

    // 按钮
    this.btnSpeed = new Button(467, TOP_Y, 60, TOP_H, 'x1', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.btnSpeed.label = 'x' + this.speed;
      Audio.click();
    }, { fontSize: 26 });
    this.btnPause = new Button(535, TOP_Y, 60, TOP_H, '停', () => {
      this.paused = !this.paused;
      this.btnPause.label = this.paused ? '续' : '停';
      Audio.click();
    }, { fontSize: 26 });
    this.btnCamp = new Button(603, TOP_Y, 60, TOP_H, '军营', () => {
      this.campOpen = true;
      this.drag = null;
      this.selected = null;
      Audio.click();
    }, { fontSize: 22 });
    this.btnGear = new Button(671, TOP_Y, 56, TOP_H, '⚙', () => {
      this.settingsOpen = true;
      this.drag = null;
      this.selected = null;
      Audio.click();
    }, { fontSize: 26 });
    this.btnRefresh = new Button(SLOT_X, BTN_Y, 470, BTN_H, '刷新', () => this.tryRefresh(), { fontSize: 26 });
    this.btnShovel = new Button(521, BTN_Y, 211, BTN_H, '铲', () => {}, { fontSize: 32 });

    // 结算面板按钮
    this.btnRetry = new Button(175, 830, 400, 70, '再来一局', () => { Audio.click(); this.scenes.switch('battle'); });
    this.btnHome = new Button(175, 920, 400, 70, '返回主页', () => { Audio.click(); this.scenes.switch('home'); });

    // 设置面板按钮
    this.btnResume = new Button(175, 700, 400, 70, '继续战斗', () => {
      Audio.click();
      this.settingsOpen = false;
    });
    this.btnExit = new Button(175, 790, 400, 70, '退出战斗', () => {
      Audio.click();
      this.settingsOpen = false;
      this.gameOver();
    });
    this.btnCloseCamp = new Button(175, 1110, 400, 70, '继续战斗', () => {
      this.campOpen = false;
      Audio.click();
    });
  }

  tryRefresh() {
    if (this.bar.refresh()) {
      Audio.click();
      if (this.bar.sinceShovel === 0) Toast.show('获得铲子！拖到未激活格子');
    }
  }

  activeAt(x, y) {
    if (y < TOP_Y || y > TOP_Y + TOP_H) return -1;
    for (let i = 0; i < this.actives.length; i++) {
      const bx = ACT_X + i * (ACT_W + ACT_GAP);
      if (x >= bx && x <= bx + ACT_W) return i;
    }
    return -1;
  }

  onSlider(x, y) {
    return x >= SLIDER_X - 20 && x <= SLIDER_X + SLIDER_W + 20 && y >= SLIDER_Y - 24 && y <= SLIDER_Y + 24;
  }

  setVolumeFromX(x) {
    const v = Math.max(0, Math.min(1, (x - SLIDER_X) / SLIDER_W));
    Audio.setVolume(v);
    getSave().settings.volume = Math.round(v * 100);
  }

  // ---------- 输入 ----------
  onPointerDown(x, y) {
    this.pointer = { x, y };
    if (this.over) {
      if (this.btnRetry.hitTest(x, y)) this.btnRetry.onClick();
      else if (this.btnHome.hitTest(x, y)) this.btnHome.onClick();
      return;
    }
    if (this.settingsOpen) {
      this.drag = null;
      if (this.btnResume.hitTest(x, y)) return this.btnResume.onClick();
      if (this.btnExit.hitTest(x, y)) return this.btnExit.onClick();
      if (this.onSlider(x, y)) {
        this.volumeDragging = true;
        this.setVolumeFromX(x);
      }
      return;
    }
    if (this.campOpen) {
      this.drag = null;
      if (this.btnCloseCamp.hitTest(x, y)) this.btnCloseCamp.onClick();
      return;
    }
    if (this.btnSpeed.hitTest(x, y)) return this.btnSpeed.onClick();
    if (this.btnPause.hitTest(x, y)) return this.btnPause.onClick();
    if (this.btnCamp.hitTest(x, y)) return this.btnCamp.onClick();
    if (this.btnGear.hitTest(x, y)) return this.btnGear.onClick();
    if (this.btnRefresh.hitTest(x, y)) return this.tryRefresh();
    if (this.btnShovel.hitTest(x, y)) {
      if (this.bar.shovels > 0) {
        this.drag = { source: 'shovel', char: '铲', x, y, downX: x, downY: y, moved: false };
      }
      return;
    }

    // 主动道具：即时型点击使用，目标型按下后拖拽施放
    const ai = this.activeAt(x, y);
    if (ai >= 0) {
      const a = this.actives[ai];
      const item = ITEMS[a.id];
      if (a.cd > 0) return Toast.show(item.name + ' 冷却中');
      if (item.castMode !== 'target') return this.useActive(ai);
      this.drag = { source: 'active', index: ai, id: a.id, x, y, downX: x, downY: y, moved: false };
      return;
    }

    const cellPos = pointToCell(x, y);
    // 从刷新栏拖起
    const slotIdx = this.slotAt(x, y);
    if (slotIdx >= 0 && this.bar.slots[slotIdx]) {
      const item = this.bar.slots[slotIdx];
      this.drag = { source: 'slot', index: slotIdx, char: item.char, kind: item.kind, x, y, downX: x, downY: y, moved: false };
      return;
    }

    // 拖起/点选已放置的将士
    if (cellPos) {
      const cell = this.grid.get(cellPos.c, cellPos.r);
      if (cell && cell.tower) {
        this.drag = { source: 'tower', tower: cell.tower, char: cell.tower.char, kind: cell.tower.kind, x, y, downX: x, downY: y, moved: false };
        return;
      }
    }

    // 点空白：取消选中
    this.selected = null;
  }

  onPointerMove(x, y) {
    this.pointer = { x, y };
    if (this.settingsOpen) {
      this.drag = null;
      if (this.volumeDragging) this.setVolumeFromX(x);
      return;
    }
    if (this.campOpen) {
      this.drag = null;
      return;
    }
    if (this.volumeDragging) {
      this.setVolumeFromX(x);
      return;
    }
    if (this.drag) {
      this.drag.x = x;
      this.drag.y = y;
      if (!this.drag.moved && Math.hypot(x - this.drag.downX, y - this.drag.downY) > TAP_DIST) {
        this.drag.moved = true;
      }
    }
  }

  onPointerUp(x, y) {
    this.pointer = { x, y };
    if (this.volumeDragging) {
      this.volumeDragging = false;
      persist();
      return;
    }
    if (!this.drag || this.settingsOpen || this.campOpen) { this.drag = null; return; }
    const drag = this.drag;
    this.drag = null;

    // 点选（位移小于阈值）
    if (!drag.moved) {
      if (drag.source === 'tower') {
        const target = drag.tower.group || drag.tower;
        this.selected = this.selected === target ? null : target;
        Audio.click();
      } else if (drag.source === 'active') {
        Toast.show('拖到将士身上使用');
      }
      return;
    }

    this.selected = null;
    const slotIdx = this.slotAt(x, y);
    const cellPos = pointToCell(x, y);

    if (drag.source === 'shovel') {
      if (!cellPos || this.bar.shovels <= 0) return;
      const cell = this.grid.get(cellPos.c, cellPos.r);
      if (!cell || cell.kind !== 'slot' || cell.active) return;
      if (!this.grid.activate(cellPos.c, cellPos.r)) return;
      this.bar.shovels--;
      this.effects.ring(x, y, '#c9a86a', 14, 240);
      Audio.place();
      Toast.show('格子已激活');
      return;
    }

    if (drag.source === 'active') {
      if (cellPos) {
        const cell = this.grid.get(cellPos.c, cellPos.r);
        if (cell && cell.tower) this.useActive(drag.index, cell.tower);
      }
      return;
    }

    if (drag.source === 'slot') {
      // 拖到另一个槽位：同字同阶直接合成，否则交换槽位内容
      if (slotIdx >= 0) {
        if (slotIdx !== drag.index) {
          const source = this.bar.slots[drag.index];
          const target = this.bar.slots[slotIdx];
          if (canMerge(target, source)) {
            mergeBarItem(target, source);
            this.bar.slots[drag.index] = null;
            Audio.merge();
            Toast.show(target.char + ' 合成升至 ' + target.tier + ' 阶');
          } else {
            this.bar.slots[slotIdx] = source;
            this.bar.slots[drag.index] = target;
            Audio.click();
          }
        }
        return;
      }
      if (!cellPos) return;
      const cell = this.grid.get(cellPos.c, cellPos.r);
      const item = this.bar.slots[drag.index];
      if (!item || !this.grid.allowsUnit(item, cellPos.c, cellPos.r)) return;
      if (cell.tower) {
        // 可合成优先，否则与格上塔交换（塔收回栏位，字部署上格）
        if (canMerge(cell.tower, item)) {
          this.mergeWithBar(cell.tower, drag);
        } else {
          const t = cell.tower;
          this.bar.slots[drag.index] = { char: t.char, kind: t.kind, tier: t.tier, level: t.level, xp: t.xp };
          this.removeTower(t);
          this.deploy(item, cellPos.c, cellPos.r);
          Audio.place();
          this.afterBoardChange();
        }
        return;
      }
      this.bar.take(drag.index);
      this.deploy(item, cellPos.c, cellPos.r);
      Audio.place();
      this.afterBoardChange();
      return;
    }

    // 拖动场上的将士
    const src = drag.tower;
    if (slotIdx >= 0) {
      // 拖回将士栏：空位收回，有字则互换
      const item = this.bar.slots[slotIdx];
      if (!item) {
        this.bar.slots[slotIdx] = { char: src.char, kind: src.kind, tier: src.tier, level: src.level, xp: src.xp };
        this.removeTower(src);
        Audio.place();
        this.afterBoardChange();
      } else {
        if (!this.grid.allowsUnit(item, src.c, src.r)) return;
        const oc = src.c, or = src.r;
        this.bar.slots[slotIdx] = { char: src.char, kind: src.kind, tier: src.tier, level: src.level, xp: src.xp };
        this.removeTower(src);
        this.deploy(item, oc, or);
        Audio.place();
        this.afterBoardChange();
      }
      return;
    }
    if (!cellPos) return;
    const cell = this.grid.get(cellPos.c, cellPos.r);
    if (!cell || !this.grid.allowsUnit(src, cellPos.c, cellPos.r)) return;
    if (cell.tower === src) return;
    if (cell.tower) {
      if (canMerge(cell.tower, src)) {
        mergeInto(cell.tower, src);
        this.removeTower(src);
        Audio.merge();
        this.effects.ring(cell.tower.x, cell.tower.y, '#ffd75a', 16, 280);
        this.effects.damageText(cell.tower.x, cell.tower.y - 56, cell.tower.tier + ' 阶!', '#ffd75a', 30);
        this.afterBoardChange();
      } else {
        // 互换位置
        const dst = cell.tower;
        const oc = src.c, or = src.r;
        if (!this.grid.allowsUnit(dst, oc, or)) return;
        const srcCell = this.grid.get(oc, or);
        this.moveTower(src, dst.c, dst.r);
        this.moveTower(dst, oc, or);
        cell.tower = src;
        if (srcCell) srcCell.tower = dst;
        Audio.place();
        this.afterBoardChange();
      }
      return;
    }
    if (!this.grid.canPlace(src, cellPos.c, cellPos.r)) return;
    // 移动到空格
    const oldCell = this.grid.get(src.c, src.r);
    if (oldCell) oldCell.tower = null;
    this.moveTower(src, cellPos.c, cellPos.r);
    cell.tower = src;
    Audio.place();
    this.afterBoardChange();
  }

  // 把将士栏的字部署到格子（保留阶/级/经验）
  deploy(item, c, r) {
    const tower = new Tower(item.char, item.tier || 1, c, r, item.kind);
    tower.level = item.level || 1;
    tower.xp = item.xp || 0;
    if (this.grid.get(c, r).kind === 'path') tower.deployAsBlocker(this.itemBuffs);
    this.grid.get(c, r).tower = tower;
    this.towers.push(tower);
    this.effects.ring(tower.x, tower.y, '#c9a86a', 10, 200);
    // 图鉴：摆放普通/增益文字即解锁
    if (item.kind === 'base') this.unlockCodex('base', item.char);
    else if (PREFIX_BUFFS[item.char]) this.unlockCodex('prefix', item.char);
    return tower;
  }

  // 召唤符：在任意空格部署一名基础将士（走与拖拽放置相同的 deploy 路径）
  tryPlaceChar(char) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.grid.canPlace({ char, kind: 'base' }, c, r)) continue;
        const unit = { char, kind: 'base', tier: 1, level: 1, xp: 0 };
        this.deploy(unit, c, r);
        Audio.place();
        this.afterBoardChange();
        return true;
      }
    }
    return false;
  }

  // 图鉴解锁：发金币奖励，集齐一类发额外奖励
  unlockCodex(catId, key) {
    const save = getSave();
    const list = save.codex[catId];
    if (!list || list.includes(key)) return;
    list.push(key);
    const cat = codexCat(catId);
    addGold(cat.reward);
    Toast.show('图鉴解锁「' + key + '」 +' + cat.reward + ' 金');
    if (cat.keys.every((k) => list.includes(k))) {
      addGold(CODEX_SET_BONUS[catId]);
      Toast.show('集齐' + cat.name + '！ +' + CODEX_SET_BONUS[catId] + ' 金');
    }
  }

  mergeWithBar(tower, drag) {
    // 刷新栏的字与场上将士合成（同字同阶）
    const item = this.bar.slots[drag.index];
    this.bar.take(drag.index);
    tower.tier++;
    if (item && item.level > tower.level) {
      tower.level = item.level;
      tower.xp = item.xp;
    }
    tower.cool = 0;
    tower.refillBlocker();
    Audio.merge();
    this.effects.ring(tower.x, tower.y, '#ffd75a', 16, 280);
    this.effects.damageText(tower.x, tower.y - 56, tower.tier + ' 阶!', '#ffd75a', 30);
    this.afterBoardChange();
  }

  removeTower(t) {
    if (t.blocking) t.leaveBlocker();
    const cell = this.grid.get(t.c, t.r);
    if (cell && cell.tower === t) cell.tower = null;
    const idx = this.towers.indexOf(t);
    if (idx >= 0) this.towers.splice(idx, 1);
  }

  moveTower(tower, c, r) {
    const destination = this.grid.get(c, r);
    const enteringRoad = destination && destination.kind === 'path';
    if (tower.blocking && !enteringRoad) tower.leaveBlocker();
    tower.c = c;
    tower.r = r;
    const pos = cellCenter(c, r);
    tower.x = pos.x;
    tower.y = pos.y;
    if (!tower.blocking && enteringRoad) tower.deployAsBlocker(this.itemBuffs);
  }

  afterBoardChange() {
    const formed = rescan(this.grid, this.towers, this.heroGroups, this.effects);
    for (const g of formed) {
      Toast.show(g.name + ' 降临战场！');
      this.unlockCodex('hero', g.name);
    }
  }

  slotAt(x, y) {
    if (y < SLOT_Y || y > SLOT_Y + SLOT_H) return -1;
    for (let i = 0; i < 5; i++) {
      const sx = SLOT_X + i * (SLOT_W + SLOT_GAP);
      if (x >= sx && x <= sx + SLOT_W) return i;
    }
    return -1;
  }

  useActive(i, target = null) {
    const a = this.actives[i];
    if (a.cd > 0) return;
    const result = dispatchActiveItem(this, a, target);
    if (result.sound && Audio[result.sound]) Audio[result.sound]();
    if (result.message) Toast.show(result.message);
    return result;
  }

  lordHpMax() {
    return LORD_HP + Math.round(this.lordHpBonus || 0);
  }

  handleKill(enemy, tower) {
    if (enemy.type === 'boss' && !enemy.bossDefeatHandled) {
      enemy.bossDefeatHandled = true;
      this.handleBossDefeated(this.wave);
    }
    this.score.kills++;
    this.bar.onKill();
    // 装备掉落
    if (Math.random() < dropChance(this.wave, this.diff.dropMul)) {
      const { inst, merged } = grantEquip(rollEquipId(), rollRarity(this.wave, this.diff.dropMul));
      const def = EQUIP[inst.id];
      const r = rarityById(inst.rarity);
      Toast.show(merged
        ? def.name + '·' + r.name + ' 合成升至 Lv' + inst.lvl
        : '掉落 ' + def.name + '·' + r.name + '！');
      Audio.coin();
    }
    // 精英/Boss 概率掉宝石，Boss 概率掉魂玉
    if (enemy.type === 'elite' && Math.random() < 0.4) addGems(Math.floor(Math.random() * 3) + 1);
    if (enemy.type === 'boss') {
      if (Math.random() < 0.7) addGems(Math.floor(Math.random() * 3) + 1);
      if (Math.random() < 0.3) addSoulJade(1);
    }
    if (!tower) return;
    // 英雄组的击杀：经验分给每个成员字
    const group = this.heroGroups.find((g) => g.puppet === tower);
    if (group) {
      for (const m of group.members) {
        if (m.gainXp(5)) this.effects.damageText(m.x, m.y - 50, '升级!', '#7fe08a', 26);
      }
      return;
    }
    if (tower.gainXp && tower.gainXp(5)) {
      this.effects.damageText(tower.x, tower.y - 50, '升级!', '#7fe08a', 26);
    }
  }

  // Task 4 calls this only for an identified Boss; normal wave-30 enemies never grant merit.
  handleBossDefeated(wave) {
    const result = claimBossCompletion(getSave(), this.diff.id, wave, this.diff.floor);
    if (this.runStartedAt && this.runId && this.runSeed && this.score) {
      queueMeritClaim(buildMeritClaim({
        difficulty: this.diff.id,
        endlessFloor: this.diff.floor || 1,
        bossWave: wave,
        runId: this.runId,
        seed: this.runSeed,
        startedAt: this.runStartedAt,
        finishedAt: new Date(),
        kills: this.score.kills + 1,
        lordHp: this.lordHp,
      }));
    }
    // 战斗胜利结算：每击败一轮 Boss（30 的倍数）即刷新商城军需，
    // 与 gameOver 的失败/退出刷新相互独立（一场战斗可结算多次）。
    const isVictory = isBossWave(wave);
    if (isVictory) refreshShopAfterBattle(getSave());
    if (!result.claimed) {
      if (isVictory) persist();
      return result;
    }

    persist();
    const meritText = '击败 Boss！获得 ' + result.merit + ' 军功';
    if (result.unlockedFloor) {
      Toast.show(meritText + '，解锁无尽·' + result.unlockedFloor + '层！');
    } else if (result.unlocked) {
      const names = { normal: '普通', hard: '困难', endless: '无尽模式' };
      Toast.show(meritText + '，解锁 ' + names[result.unlocked] + '！');
    } else {
      Toast.show(meritText + '！');
    }
    return result;
  }

  // ---------- 更新 ----------
  update(dt) {
    this.effects.update(dt);
    Toast.update(dt);
    if (this.over || this.paused || this.settingsOpen || this.campOpen) return;
    dt *= this.speed;
    this.elapsed += dt;

    // 主动道具冷却
    for (const a of this.actives) if (a.cd > 0) a.cd -= dt;

    // 刷新栏
    this.bar.wave = this.wave;
    this.bar.update(dt);

    // 波次推进
    if (this.waveState === 'rest') {
      this.restTimer -= dt;
      if (this.restTimer <= 0) {
        this.wave++;
        this.waveCfg = waveConfig(this.wave, this.diff);
        this.spawnQueue = spawnPlan(this.wave, this.waveCfg);
        this.spawnIndex = 0;
        this.toSpawn = this.spawnQueue.length;
        this.spawnTimer = 0;
        this.waveState = 'wave';
        Toast.show('第 ' + this.wave + ' 波来袭！');
      }
    } else {
      if (this.spawnIndex < this.spawnQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = this.waveCfg.spawnInterval;
          const descriptor = this.spawnQueue[this.spawnIndex++];
          this.toSpawn = this.spawnQueue.length - this.spawnIndex;
          if (recordCodexEncounter(getSave(), descriptor.type, descriptor.key)) persist();
          const e = new Enemy(descriptor);
          const p = pointAt(0);
          e.x = p.x; e.y = p.y;
          this.enemies.push(e);
        }
      } else if (this.enemies.length === 0) {
        this.score.wave = this.wave;
        this.waveState = 'rest';
        this.restTimer = WAVE_REST;
      }
    }

    // 先分配阻挡，再更新敌军：新被拦住的敌人本帧即停止移动。
    assignBlockers(this.towers, this.enemies);
    const blockedAtFrameStart = new Set(this.enemies.filter((enemy) => enemy.blocker));

    // 敌人（阻挡攻击独立于将士眩晕状态）
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(dt, {
        holdPosition: blockedAtFrameStart.has(e),
        onBlockHit: (enemy, blocker, damage) => {
          this.effects.tracer(enemy.x, enemy.y, blocker.x, blocker.y, '#ffb15c');
          this.effects.damageText(blocker.x, blocker.y - 52, '-' + damage, '#ff805c', 22);
        },
        onBlockerDeath: (blocker) => {
          this.effects.burst(blocker.x, blocker.y, '#c9a86a', 12, 220);
          this.effects.shake(4, 0.12);
          if (this.selected === blocker) this.selected = null;
          this.removeTower(blocker);
        },
        onBurnDamage: (enemy, damage) => {
          this.effects.damageText(enemy.x, enemy.y - 48, String(Math.round(damage)), '#ff8050', 21);
        },
        onBurnKill: (enemy, source) => this.handleKill(enemy, source),
      });
      if (e.dead) continue;
      this.updateEnemySkill(e, dt);
      if (e.reached && !e.dead) {
        e.dead = true;
        this.lordHp--;
        this.effects.shake(7, 0.2);
        this.effects.damageText(e.x, e.y - 40, '-1', '#ff5a4a', 34);
        Audio.hurt();
        if (this.lordHp <= 0) {
          this.gameOver();
          return;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // 曹操光环：将士与英雄组都受益
    for (const t of this.towers) t.auraSpd = 0;
    for (const g of this.heroGroups) g.puppet.auraSpd = 0;
    for (const g of this.heroGroups) {
      if (g.name !== '曹操') continue;
      for (const o of this.towers) {
        if (!o.inert && Math.hypot(o.x - g.x, o.y - g.y) <= 3 * CELL) {
          o.auraSpd = Math.max(o.auraSpd, 0.15);
        }
      }
      for (const o of this.heroGroups) {
        if (o !== g && Math.hypot(o.x - g.x, o.y - g.y) <= 3 * CELL) {
          o.puppet.auraSpd = Math.max(o.puppet.auraSpd, 0.15);
        }
      }
    }

    // 将士与英雄组
    const ctx2 = {
      enemies: this.enemies,
      effects: this.effects,
      itemBuffs: this.itemBuffs,
      unitGear: this.unitGear,
      onKill: (e, tower) => this.handleKill(e, tower),
    };
    for (const t of this.towers) t.update(dt, ctx2);
    for (const g of this.heroGroups) g.update(dt, ctx2);
  }

  updateEnemySkill(enemy, dt) {
    if (!enemy.skill || enemy.dead || enemy.reached) return;
    const next = advanceSkillTimer({
      cooldown: enemy.skillCooldown,
      telegraph: enemy.skillTelegraphTimer,
    }, enemy.skill, dt);
    enemy.skillCooldown = next.cooldown;
    enemy.skillTelegraphTimer = next.telegraph;
    if (!next.fired) return;

    const combatTowers = this.towers
      .filter((tower) => !tower.inert && !tower.group)
      .concat(this.heroGroups.map((group) => group.puppet));
    const targets = selectStunTargets(enemy, combatTowers, enemy.skill, (tower) => {
      const gear = this.unitGear[gearKeyFor(tower)];
      const stats = tower.stats(this.itemBuffs, gear);
      return stats ? stats.range : (tower.base ? tower.base.range : 0);
    });
    let applied = 0;
    for (const tower of targets) {
      if (!tower.applyStun(stunDurationAfterBuffs(enemy.skill.duration, this.itemBuffs))) continue;
      applied++;
      this.effects.ring(tower.x, tower.y, '#8ed8ff', 12, 220);
      this.effects.damageText(tower.x, tower.y - 48, '眩晕!', '#8ed8ff', 25);
    }
    if (applied > 0) {
      this.effects.shake(enemy.type === 'boss' ? 7 : 4, 0.16);
      Audio.boom();
    }
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    const coins = Math.round(this.score.coins(this.itemBuffs.coin) * this.diff.coinMul);
    this.earnedCoins = coins;
    addGold(coins);
    const save = getSave();
    if (this.score.wave > save.bestWave) {
      save.bestWave = this.score.wave;
    }
    // 难度最佳纪录
    const bestKey = this.diff.id === 'endless' ? 'endless' + this.diff.floor : this.diff.id;
    if (this.score.wave > (save.diff.best[bestKey] || 0)) {
      save.diff.best[bestKey] = this.score.wave;
    }
    refreshShopAfterBattle(save);
    persist();
  }

  // ---------- 渲染 ----------
  render(ctx) {
    // 背景
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);

    const shake = this.effects.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.grid.render(ctx);
    this.renderShovelTarget(ctx);
    this.grid.renderLord(ctx, this.lordHp, LORD_HP + Math.round(this.lordHpBonus));
    for (const g of this.heroGroups) {
      g.render(ctx);
      g.puppet.renderStunStatus(ctx);
    }
    for (const t of this.towers) {
      if (this.drag && this.drag.source === 'tower' && this.drag.tower === t && this.drag.moved) continue;
      t.render(ctx);
    }
    for (const e of this.enemies) e.render(ctx);
    this.renderSelection(ctx);
    this.effects.render(ctx);
    ctx.restore();

    this.renderHud(ctx);
    this.renderBar(ctx);

    // 波次倒计时（置顶，避免遮挡详情面板）
    if (!this.over && this.waveState === 'rest') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd75a';
      ctx.font = 'bold 38px KaiTi, STKaiti, serif';
      const msg = this.wave === 0
        ? '战斗将于 ' + Math.ceil(this.restTimer) + 's 后开始'
        : '下一波 ' + Math.ceil(this.restTimer) + 's';
      ctx.fillText(msg, 375, 152);
      ctx.restore();
    }

    // 拖拽中的字/道具
    if (this.drag && this.drag.moved) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(50, 38, 24, 0.9)';
      ctx.beginPath();
      ctx.arc(this.drag.x, this.drag.y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd75a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (this.drag.source === 'active') {
        ctx.fillStyle = '#f0c8e0';
        ctx.font = 'bold 24px KaiTi, STKaiti, serif';
        ctx.fillText(ITEMS[this.drag.id].name, this.drag.x, this.drag.y + 2);
      } else {
        const style = this.drag.kind === 'base' ? BASE_UNITS[this.drag.char] : ADV_CHARS[this.drag.char];
        ctx.fillStyle = (style && style.color) || '#e8c35a';
        ctx.font = 'bold 46px KaiTi, STKaiti, serif';
        ctx.fillText(this.drag.char, this.drag.x, this.drag.y + 2);
      }
      ctx.restore();
    }

    if (this.settingsOpen) this.renderSettings(ctx);
    if (this.campOpen) this.renderCamp(ctx);
    if (this.over) this.renderOver(ctx);
    Toast.render(ctx);
  }

  // 选中将士/英雄组：射程圈 + 详情面板
  renderSelection(ctx) {
    if (!this.selected) return;
    const isGroup = this.selected instanceof HeroGroup;
    const puppet = isGroup ? this.selected.puppet : this.selected;
    const s = puppet.stats(this.itemBuffs, this.unitGear[gearKeyFor(puppet)]);

    // 进阶字（未组词）：显示增益作用或可组词组
    if (!s) {
      drawPanel(ctx, 95, 460, 560, 300, puppet.char + '（进阶字）');
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '26px KaiTi, STKaiti, serif';
      let ly = 560;
      ctx.fillText('阶数 ' + puppet.tier + ' · Lv' + puppet.level, 135, ly);
      ly += 44;
      const buff = PREFIX_BUFFS[puppet.char];
      if (buff) {
        ctx.fillStyle = '#a8d8a0';
        ctx.fillText('增益：与基础兵相邻时 ' + buff.label, 135, ly);
        ly += 44;
      }
      const combos = HERO_NAMES.filter((n) => n.includes(puppet.char));
      if (combos.length > 0) {
        ctx.fillStyle = '#e8c35a';
        ctx.fillText('可组词组：' + combos.join('、'), 135, ly);
        ly += 44;
      }
      ctx.fillStyle = '#a8895a';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.fillText('与其他字相邻组成词组后激活', 135, ly);
      ctx.restore();
      return;
    }

    // 射程圈
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 90, 0.8)';
    ctx.fillStyle = 'rgba(255, 215, 90, 0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(puppet.x, puppet.y, s.range * CELL, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 详情面板
    const title = isGroup ? this.selected.name : (puppet.kind === 'adv' ? puppet.char + '（进阶字）' : puppet.char);
    drawPanel(ctx, 95, 460, 560, 330, title);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '26px KaiTi, STKaiti, serif';
    const lines = isGroup
      ? ['阶数 ' + puppet.tier + ' · Lv' + puppet.level + '（成员均值）',
         '攻击 ' + Math.round(s.atk) + ' · 攻速 ' + (1 / s.interval).toFixed(2) + '/s · 射程 ' + s.range.toFixed(1)]
      : ['阶数 ' + puppet.tier + ' · Lv' + puppet.level + '（经验 ' + Math.floor(puppet.xp) + '）',
         '攻击 ' + Math.round(s.atk) + ' · 攻速 ' + (1 / s.interval).toFixed(2) + '/s · 射程 ' + s.range.toFixed(1)];
    if (!isGroup && puppet.blocking) {
      lines[1] = '阻挡生命 ' + Math.ceil(puppet.blockHp) + '/' + puppet.blockMaxHp
        + ' · 容量 ' + puppet.blockedEnemies.length + '/' + puppet.blockCapacity;
    }
    if (!isGroup && puppet.buffChars.length > 0) lines.push('词组强化：' + puppet.buffChars.join(' '));
    if (isGroup) lines.push('成员：' + this.selected.members.map((m) => m.char + m.tier + '阶').join(' '));
    const desc = isGroup ? (HEROES[this.selected.name] || {}).desc : (puppet.base || {}).desc;
    if (desc) lines.push(desc);
    lines.forEach((line, i) => ctx.fillText(line, 135, 560 + i * 44));
    ctx.restore();
  }

  renderShovelTarget(ctx) {
    if (!this.drag || this.drag.source !== 'shovel' || !this.drag.moved) return;
    const cellPos = pointToCell(this.drag.x, this.drag.y);
    if (!cellPos) return;
    const cell = this.grid.get(cellPos.c, cellPos.r);
    if (!cell) return;
    const center = cellCenter(cellPos.c, cellPos.r);
    const valid = cell.kind === 'slot' && !cell.active && this.bar.shovels > 0;
    ctx.save();
    ctx.strokeStyle = valid ? '#c9a86a' : 'rgba(150, 75, 65, 0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(center.x - CELL / 2 + 6, center.y - CELL / 2 + 6, CELL - 12, CELL - 12);
    ctx.restore();
  }

  renderHud(ctx) {
    ctx.save();
    ctx.font = '24px KaiTi, STKaiti, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c9a8ff';
    ctx.fillText(this.diff.name, 39, 34);
    ctx.fillStyle = '#f0d8a8';
    ctx.fillText('波次 ' + Math.max(1, this.wave), 175, 34);
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText('主公 ' + Math.max(0, this.lordHp) + '/' + (LORD_HP + Math.round(this.lordHpBonus)), 285, 34);
    ctx.fillStyle = '#a8d8a0';
    ctx.fillText('击杀 ' + this.score.kills, 440, 34);
    ctx.fillStyle = '#a8c8e0';
    const mm = String(Math.floor(this.elapsed / 60)).padStart(2, '0');
    const ss = String(Math.floor(this.elapsed % 60)).padStart(2, '0');
    ctx.fillText(mm + ':' + ss, 545, 34);
    ctx.fillStyle = '#e8c35a';
    ctx.textAlign = 'right';
    ctx.fillText('金 ' + getSave().gold, 732, 34);
    ctx.restore();

    // 主动道具按钮（点击即用 / 指向型可拖拽）
    for (let i = 0; i < this.actives.length; i++) {
      const a = this.actives[i];
      const item = ITEMS[a.id];
      const bx = ACT_X + i * (ACT_W + ACT_GAP);
      ctx.save();
      ctx.fillStyle = a.cd > 0 ? '#3a3330' : '#4a2a3a';
      ctx.strokeStyle = '#c98ab8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundRect(ctx, bx, TOP_Y, ACT_W, TOP_H, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = a.cd > 0 ? '#888' : '#f0c8e0';
      ctx.font = '24px KaiTi, STKaiti, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = a.cd > 0 ? item.name + ' ' + Math.ceil(a.cd) + 's' : item.name;
      ctx.fillText(label, bx + ACT_W / 2, TOP_Y + TOP_H / 2 - (a.cd > 0 ? 0 : 8));
      if (a.cd <= 0) {
        ctx.fillStyle = '#a8889a';
        ctx.font = '18px KaiTi, STKaiti, serif';
        ctx.fillText(item.castMode === 'target' ? '拖到将士' : '点击施放', bx + ACT_W / 2, TOP_Y + TOP_H - 14);
      }
      ctx.restore();
    }

    this.btnSpeed.draw(ctx);
    this.btnPause.draw(ctx);
    this.btnCamp.draw(ctx);
    this.btnGear.draw(ctx);
  }

  renderBar(ctx) {
    ctx.save();
    // 栏背景
    ctx.fillStyle = 'rgba(30, 22, 14, 0.9)';
    ctx.fillRect(0, 1170, 750, 164);
    ctx.strokeStyle = '#5a4528';
    ctx.beginPath();
    ctx.moveTo(0, 1170);
    ctx.lineTo(750, 1170);
    ctx.stroke();

    for (let i = 0; i < 5; i++) {
      const sx = SLOT_X + i * (SLOT_W + SLOT_GAP);
      const item = this.bar.slots[i];
      const dragging = this.drag && this.drag.source === 'slot' && this.drag.index === i && this.drag.moved;
      ctx.fillStyle = '#2e2418';
      ctx.fillRect(sx, SLOT_Y, SLOT_W, SLOT_H);
      ctx.strokeStyle = '#6a5232';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, SLOT_Y, SLOT_W, SLOT_H);
      if (item && !dragging) {
        const style = item.kind === 'base' ? BASE_UNITS[item.char] : ADV_CHARS[item.char];
        ctx.fillStyle = (style && style.color) || '#e8c35a';
        ctx.font = 'bold 48px KaiTi, STKaiti, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.char, sx + SLOT_W / 2, SLOT_Y + SLOT_H / 2 + 2);
        if (item.tier > 1) {
          ctx.fillStyle = '#e8c35a';
          ctx.font = 'bold 18px sans-serif';
          ctx.fillText('ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ'[Math.min(item.tier, 10) - 1], sx + SLOT_W - 16, SLOT_Y + 16);
        }
        if (item.kind === 'adv') {
          ctx.fillStyle = '#e8c35a';
          ctx.font = '16px KaiTi, STKaiti, serif';
          ctx.textAlign = 'left';
          ctx.fillText('词', sx + 8, SLOT_Y + 16);
        }
      }
    }
    ctx.restore();

    // 刷新按钮（带冷却）
    const ready = this.bar.ready;
    this.btnRefresh.label = ready ? '刷新' : '冷却 ' + Math.ceil(this.bar.cool) + 's';
    this.btnRefresh.opts.disabled = !ready;
    this.btnRefresh.opts.sub = ready ? '下次冷却 ' + (this.bar.coolMax + 10) + 's' : '';
    this.btnRefresh.draw(ctx);

    this.btnShovel.label = '铲 ×' + this.bar.shovels;
    this.btnShovel.opts.disabled = this.bar.shovels === 0;
    this.btnShovel.opts.sub = this.bar.shovels > 0 ? '拖至未激活格' : '暂无铲子';
    this.btnShovel.draw(ctx);
  }

  renderSettings(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 125, 430, 500, 520, '设 置');

    // 音量滑条
    const vol = Math.round(Audio.getVolume() * 100);
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '28px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('音量 ' + vol, 375, 555);
    ctx.fillStyle = '#3a322a';
    ctx.fillRect(SLIDER_X, SLIDER_Y - 6, SLIDER_W, 12);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(SLIDER_X, SLIDER_Y - 6, SLIDER_W * (vol / 100), 12);
    ctx.beginPath();
    ctx.arc(SLIDER_X + SLIDER_W * (vol / 100), SLIDER_Y, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd75a';
    ctx.fill();
    ctx.strokeStyle = '#8a6a42';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    this.btnResume.draw(ctx);
    this.btnExit.draw(ctx);
  }

  renderCamp(ctx) {
    const snapshot = this.charPool.snapshot();
    const chars = [...new Set(getSave().unlockedChars)].filter((char) => ADV_CHARS[char]);
    const initialTotal = Object.values(snapshot).reduce((total, entry) => total + entry.initial, 0);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 70, 140, 610, 1080, '军 营');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '28px KaiTi, STKaiti, serif';
    ctx.fillText('总剩余 ' + this.charPool.remainingTotal() + ' / ' + initialTotal, 375, 255);
    ctx.fillStyle = '#a8895a';
    ctx.font = '20px KaiTi, STKaiti, serif';
    ctx.fillText('进阶字：剩余 / 初始（出现即消耗，不会返还）', 375, 292);

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const entry = snapshot[char] || { remaining: 0, initial: 0 };
      const column = Math.floor(i / 15);
      const row = i % 15;
      const x = column === 0 ? 190 : 470;
      const y = 345 + row * 50;
      ctx.fillStyle = entry.remaining > 0 ? '#f0d8a8' : '#76695c';
      ctx.font = '26px KaiTi, STKaiti, serif';
      ctx.textAlign = 'left';
      ctx.fillText(char, x, y);
      ctx.textAlign = 'right';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.fillText(entry.remaining + ' / ' + entry.initial, x + 145, y);
    }
    ctx.restore();
    this.btnCloseCamp.draw(ctx);
  }

  renderOver(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 125, 480, 500, 540, '战 报');
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '32px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.diff.name, 375, 580);
    ctx.fillText('坚守波次：' + this.score.wave, 375, 630);
    ctx.fillText('击杀敌军：' + this.score.kills, 375, 680);
    ctx.fillStyle = '#e8c35a';
    ctx.font = '40px KaiTi, STKaiti, serif';
    ctx.fillText('获得金币 ' + this.earnedCoins, 375, 740);
    ctx.restore();
    this.btnRetry.draw(ctx);
    this.btnHome.draw(ctx);
  }
}

function createRunId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function createRunSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
