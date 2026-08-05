// 装备：玩家装备（武器/护甲/饰品）+ 将士武器（按兵种佩戴）
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { EQUIP, RARITIES, PLAYER_SLOTS, equipStats, equipStatText, rarityById, rollAffixes, unitSlotNames as resolveUnitSlotNames } from '../config/equipment.js';
import { getSave, persist, equipByUid, spendGems, spendSoulJade } from './saveData.js';

const SLOT_Y = 290, SLOT_H = 120;
const SLOT_W = 124, SLOT_GAP = 10, SLOT_MARGIN = 40, SLOT_ROW_GAP = 10;
const LIST_Y = 470, ROW_H = 96;
const ENHANCE_X = 560, ENHANCE_W = 120, ENHANCE_H = 56;
const REFINE_X = 440, REFINE_W = 108; // 洗练按钮：置于提升按钮（560~680）左侧
const TAP_DIST = 10;

export class EquipScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.tab = 'player'; // 'player' | 'unit'
    this.selectedUid = null; // 将士武器 tab 中选中的待装备武器
    this.scroll = 0;
    this.press = null;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.btnTabPlayer = new Button(175, 195, 195, 60, '玩家装备', () => { Audio.click(); this.tab = 'player'; this.selectedUid = null; this.scroll = 0; }, { fontSize: 28 });
    this.btnTabUnit = new Button(380, 195, 195, 60, '将士武器', () => { Audio.click(); this.tab = 'unit'; this.scroll = 0; }, { fontSize: 28 });
  }

  enter() { this.selectedUid = null; this.scroll = 0; this.press = null; }

  maxScroll() {
    const viewH = 1334 - this.listTopFor(this.slotRects()) - 224; // 底部留白同单行（410→470）间距
    return Math.max(0, this.ownedOf(this.tab).length * ROW_H - viewH);
  }

  ownedOf(kind) {
    return getSave().equipment.owned.filter((e) => EQUIP[e.id].kind === kind);
  }

  enhance(uid) {
    const inst = equipByUid(uid);
    if (!inst) return Toast.show('装备不存在');
    const cost = 10 + 5 * (inst.lvl - 1);
    if (!spendGems(cost)) return Toast.show('宝石不足');
    inst.lvl += 1;
    persist();
    Audio.coin();
    Toast.show(inst.id + ' 升至 Lv' + inst.lvl);
  }

  refine(uid) {
    const inst = equipByUid(uid);
    if (!inst) return Toast.show('装备不存在');
    if (!spendSoulJade(1)) return Toast.show('魂玉不足');
    inst.affixes = rollAffixes(inst.rarity);
    persist();
    Audio.place();
    Toast.show('洗练完成，附加词条已刷新');
  }

  // 动态将士武器槽位：基础兵种 + 已解锁英雄
  unitSlotNames(save) {
    return resolveUnitSlotNames(save);
  }

  // 拥有列表顶部：位于最后一个槽位下方 60px（对齐单行时 410→470 的间距）
  listTopFor(rects) {
    const last = rects[rects.length - 1];
    const lastBottom = last ? last.y + last.h : SLOT_Y + SLOT_H;
    return lastBottom + 60;
  }

  slotRects() {
    const slots = this.tab === 'player' ? PLAYER_SLOTS : resolveUnitSlotNames(getSave());
    const w = this.tab === 'player' ? 200 : SLOT_W;
    const gap = this.tab === 'player' ? 30 : SLOT_GAP;
    if (this.tab === 'player') {
      const totalW = slots.length * w + (slots.length - 1) * gap;
      const x0 = (750 - totalW) / 2;
      return slots.map((name, i) => ({ name, x: x0 + i * (w + gap), y: SLOT_Y, w, h: SLOT_H }));
    }
    // 将士武器：槽位多于一行时换行（每行 5 个），各行 y 依次下移
    const slotsPerRow = Math.max(1, Math.floor((750 - 2 * SLOT_MARGIN) / (SLOT_W + SLOT_GAP)));
    const rowWidth = slotsPerRow * SLOT_W + (slotsPerRow - 1) * SLOT_GAP;
    const x0 = (750 - rowWidth) / 2;
    return slots.map((name, i) => {
      const row = Math.floor(i / slotsPerRow);
      const col = i % slotsPerRow;
      return { name, x: x0 + col * (w + gap), y: SLOT_Y + row * (SLOT_H + SLOT_ROW_GAP), w, h: SLOT_H };
    });
  }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (this.btnTabPlayer.hitTest(x, y)) return this.btnTabPlayer.onClick();
    if (this.btnTabUnit.hitTest(x, y)) return this.btnTabUnit.onClick();

    const save = getSave();
    const rects = this.slotRects();
    const slotMap = this.tab === 'player' ? save.equipment.player : save.equipment.units;

    // 点槽位：将士武器 tab 且有选中武器 → 装备；否则卸下
    // （槽位可能换行下移，故先于拖动捕获区判断，避免低行槽位被当作拖动）
    for (const r of rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (this.tab === 'unit' && this.selectedUid != null) {
          slotMap[r.name] = this.selectedUid;
          this.selectedUid = null;
          persist();
          Audio.place();
          Toast.show('已佩戴到「' + r.name + '」');
        } else if (slotMap[r.name] != null) {
          slotMap[r.name] = null;
          persist();
          Audio.click();
          Toast.show('已卸下');
        }
        return;
      }
    }

    // 仅列表区域（槽位下方）捕获拖动；区域起点在槽位区（y≈290~410）之下
    if (x >= 60 && x <= 681 && y >= LIST_Y - 20) {
      this.press = { x, y, scroll: this.scroll, moved: false };
      return;
    }
  }

  onPointerMove(_x, y) {
    if (!this.press) return;
    if (Math.abs(y - this.press.y) > TAP_DIST) this.press.moved = true;
    if (!this.press.moved) return;
    const next = this.press.scroll + this.press.y - y;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), next));
  }

  enhanceRect(rowY) {
    return { x: ENHANCE_X, y: rowY + 20, w: ENHANCE_W, h: ENHANCE_H };
  }

  refineRect(rowY) {
    return { x: REFINE_X, y: rowY + 20, w: REFINE_W, h: ENHANCE_H };
  }

  onPointerUp(x, y) {
    const press = this.press;
    this.press = null;
    if (!press || press.moved) return;

    // 点列表项（行 y 依 scroll 偏移）；拖动超过阈值时不触发
    const list = this.ownedOf(this.tab);
    const rects = this.slotRects();
    const listTop = this.listTopFor(rects);
    for (let i = 0; i < list.length; i++) {
      const ry = listTop + i * ROW_H - this.scroll;
      // 行内提升按钮（右侧 560~680）：先命中则提升，不触发整行装备
      const er = this.enhanceRect(ry);
      if (x >= er.x && x <= er.x + er.w && y >= er.y && y <= er.y + er.h) {
        this.enhance(list[i].uid);
        return;
      }
      // 行内洗练按钮（提升按钮左侧 440~548）：消耗 1 魂玉重随附加词条
      const rr = this.refineRect(ry);
      if (x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h) {
        this.refine(list[i].uid);
        return;
      }
      // 行内装备区域（洗练按钮左侧）：点击装备/卸下
      if (x >= 60 && x < REFINE_X && y >= ry && y <= ry + ROW_H - 10) {
        const inst = list[i];
        const save = getSave();
        if (this.tab === 'player') {
          const slot = EQUIP[inst.id].slot;
          save.equipment.player[slot] = save.equipment.player[slot] === inst.uid ? null : inst.uid;
          persist();
          Audio.place();
          Toast.show(save.equipment.player[slot] ? '已装备到「' + slot + '」' : '已卸下');
        } else {
          this.selectedUid = this.selectedUid === inst.uid ? null : inst.uid;
          Audio.click();
          if (this.selectedUid != null) Toast.show('点击上方兵种槽佩戴');
        }
        return;
      }
    }
  }

  update(dt) { Toast.update(dt); }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '装 备');
    this.btnBack.draw(ctx);

    const save = getSave();
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '28px KaiTi, STKaiti, serif';
    ctx.fillText('金币 ' + save.gold, 700, 70);
    ctx.restore();

    // 页签
    this.btnTabPlayer.opts.bg = this.tab === 'player' ? '#6a4a1a' : '#5a3a28';
    this.btnTabUnit.opts.bg = this.tab === 'unit' ? '#6a4a1a' : '#5a3a28';
    this.btnTabPlayer.draw(ctx);
    this.btnTabUnit.draw(ctx);

    // 槽位
    const slotMap = this.tab === 'player' ? save.equipment.player : save.equipment.units;
    const rects = this.slotRects();
    for (const r of rects) {
      const inst = equipByUid(slotMap[r.name]);
      ctx.save();
      ctx.fillStyle = 'rgba(50, 38, 24, 0.8)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = inst ? rarityById(inst.rarity).color : '#6a5232';
      ctx.lineWidth = inst ? 3 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a8895a';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.fillText(r.name, r.x + r.w / 2, r.y + 22);
      if (inst) {
        const def = EQUIP[inst.id];
        ctx.fillStyle = rarityById(inst.rarity).color;
        ctx.font = '24px KaiTi, STKaiti, serif';
        ctx.fillText(def.name, r.x + r.w / 2, r.y + 58);
        ctx.font = '18px KaiTi, STKaiti, serif';
        ctx.fillText(rarityById(inst.rarity).name + ' Lv' + inst.lvl, r.x + r.w / 2, r.y + 88);
      } else {
        ctx.fillStyle = '#5a4a3a';
        ctx.font = '24px KaiTi, STKaiti, serif';
        ctx.fillText('空', r.x + r.w / 2, r.y + 66);
      }
      ctx.restore();
    }

    // 拥有列表（剪辑区起点位于最后一个槽位下方，让出多行槽位空间）
    const list = this.ownedOf(this.tab);
    const listTop = this.listTopFor(rects);
    const listH = 1334 - listTop - 160;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8895a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText(this.tab === 'player' ? '拥有装备（点击装备/卸下）' : '拥有武器（点击选中，再点兵种槽佩戴）', 60, listTop - 25);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(60, listTop, 621, listH);
    ctx.clip();
    ctx.translate(0, -this.scroll);

    if (list.length === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6a5a42';
      ctx.font = '26px KaiTi, STKaiti, serif';
      ctx.fillText('暂无装备，战斗中击杀敌军有几率掉落', 375, listTop + 40);
      ctx.restore();
    }

    list.forEach((inst, i) => {
      const ry = listTop + i * ROW_H;
      const equipped = (this.tab === 'player' ? Object.values(save.equipment.player) : Object.values(save.equipment.units)).includes(inst.uid);
      const selected = this.selectedUid === inst.uid;
      ctx.save();
      ctx.fillStyle = selected ? 'rgba(90, 70, 30, 0.9)' : 'rgba(50, 38, 24, 0.7)';
      ctx.fillRect(60, ry, 621, ROW_H - 10);
      ctx.strokeStyle = selected ? '#ffd75a' : rarityById(inst.rarity).color;
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(60, ry, 621, ROW_H - 10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rarityById(inst.rarity).color;
      ctx.font = '26px KaiTi, STKaiti, serif';
      ctx.fillText(equipStatText(inst), 80, ry + 30);
      ctx.fillStyle = '#a8895a';
      ctx.font = '20px KaiTi, STKaiti, serif';
      const def = EQUIP[inst.id];
      const kindText = def.kind === 'player' ? '玩家装备 · ' + def.slot : '将士武器';
      ctx.fillText(kindText + (equipped ? ' · 已装备' : ''), 80, ry + 62);

      // 提升按钮（右侧）：10 + 5*(lvl-1) 宝石
      const er = this.enhanceRect(ry);
      ctx.fillStyle = '#5a3a28';
      ctx.fillRect(er.x, er.y, er.w, er.h);
      ctx.strokeStyle = '#c9a86a';
      ctx.lineWidth = 1;
      ctx.strokeRect(er.x, er.y, er.w, er.h);
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.textAlign = 'center';
      ctx.fillText('升 ' + (10 + 5 * (inst.lvl - 1)) + '宝', er.x + er.w / 2, er.y + er.h / 2);

      // 洗练按钮（提升按钮左侧）：消耗 1 魂玉重随附加词条
      const rr = this.refineRect(ry);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.strokeStyle = '#9a8ac0';
      ctx.lineWidth = 1;
      ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
      ctx.fillStyle = '#e0d8f0';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.textAlign = 'center';
      ctx.fillText('洗练 1魂', rr.x + rr.w / 2, rr.y + rr.h / 2);
      ctx.restore();
    });

    ctx.restore();

    Toast.render(ctx);
  }
}
