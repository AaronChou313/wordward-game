// 装备：玩家装备（武器/护甲/饰品）+ 将士武器（按兵种佩戴）
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { EQUIP, RARITIES, PLAYER_SLOTS, UNIT_SLOTS, equipStats, equipStatText, rarityById } from '../config/equipment.js';
import { getSave, persist, equipByUid, spendGems } from './saveData.js';

const SLOT_Y = 290, SLOT_H = 120;
const LIST_Y = 470, ROW_H = 96;
const ENHANCE_X = 560, ENHANCE_W = 120, ENHANCE_H = 56;
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
    return Math.max(0, this.ownedOf(this.tab).length * ROW_H - 640);
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

  slotRects() {
    const slots = this.tab === 'player' ? PLAYER_SLOTS : UNIT_SLOTS;
    const w = this.tab === 'player' ? 200 : 124;
    const gap = this.tab === 'player' ? 30 : 10;
    const totalW = slots.length * w + (slots.length - 1) * gap;
    const x0 = (750 - totalW) / 2;
    return slots.map((name, i) => ({ name, x: x0 + i * (w + gap), y: SLOT_Y, w, h: SLOT_H }));
  }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (this.btnTabPlayer.hitTest(x, y)) return this.btnTabPlayer.onClick();
    if (this.btnTabUnit.hitTest(x, y)) return this.btnTabUnit.onClick();

    // 仅列表区域（槽位下方）捕获拖动；区域起点在槽位区（y≈290~410）之下
    if (x >= 60 && x <= 681 && y >= LIST_Y - 20) {
      this.press = { x, y, scroll: this.scroll, moved: false };
      return;
    }

    const save = getSave();
    const rects = this.slotRects();
    const slotMap = this.tab === 'player' ? save.equipment.player : save.equipment.units;

    // 点槽位：将士武器 tab 且有选中武器 → 装备；否则卸下
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

  onPointerUp(x, y) {
    const press = this.press;
    this.press = null;
    if (!press || press.moved) return;

    // 点列表项（行 y 依 scroll 偏移）；拖动超过阈值时不触发
    const list = this.ownedOf(this.tab);
    for (let i = 0; i < list.length; i++) {
      const ry = LIST_Y + i * ROW_H - this.scroll;
      // 行内提升按钮（右侧 560~680）：先命中则提升，不触发整行装备
      const er = this.enhanceRect(ry);
      if (x >= er.x && x <= er.x + er.w && y >= er.y && y <= er.y + er.h) {
        this.enhance(list[i].uid);
        return;
      }
      if (x >= 60 && x < ENHANCE_X && y >= ry && y <= ry + ROW_H - 10) {
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
    for (const r of this.slotRects()) {
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

    // 拥有列表
    const list = this.ownedOf(this.tab);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8895a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText(this.tab === 'player' ? '拥有装备（点击装备/卸下）' : '拥有武器（点击选中，再点兵种槽佩戴）', 60, 445);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(60, 470, 621, 640);
    ctx.clip();
    ctx.translate(0, -this.scroll);

    if (list.length === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6a5a42';
      ctx.font = '26px KaiTi, STKaiti, serif';
      ctx.fillText('暂无装备，战斗中击杀敌军有几率掉落', 375, 700);
      ctx.restore();
    }

    list.forEach((inst, i) => {
      const ry = LIST_Y + i * ROW_H;
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
      ctx.restore();
    });

    ctx.restore();

    Toast.render(ctx);
  }
}
