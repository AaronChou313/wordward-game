// 背包：装备/卸下/升级/出售；上限 3 主动 + 6 被动
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { ITEMS, MAX_ACTIVE, MAX_PASSIVE, upgradeCost, sellPrice } from '../config/items.js';
import { getSave, spendGold, addGold, persist } from './saveData.js';

export class InventoryScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
  }

  enter() {}

  ownedIds() {
    return Object.keys(getSave().items.owned);
  }

  isEquipped(id) {
    const s = getSave().items;
    return s.equippedActive.some((e) => e.id === id) || s.equippedPassive.some((e) => e.id === id);
  }

  toggleEquip(id) {
    const s = getSave();
    const item = ITEMS[id];
    const listKey = item.kind === 'active' ? 'equippedActive' : 'equippedPassive';
    const max = item.kind === 'active' ? MAX_ACTIVE : MAX_PASSIVE;
    const list = s.items[listKey];
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      Toast.show('已卸下 ' + item.name);
    } else {
      if (list.length >= max) return Toast.show((item.kind === 'active' ? '主动' : '被动') + '栏位已满（' + max + '）');
      list.push({ id, level: s.items.owned[id] });
      Toast.show('已装备 ' + item.name);
    }
    persist();
    Audio.click();
  }

  upgrade(id) {
    const s = getSave();
    const lvl = s.items.owned[id];
    const cost = upgradeCost(id, lvl);
    if (!spendGold(cost)) return Toast.show('金币不足');
    s.items.owned[id] = lvl + 1;
    // 同步装备中的等级
    for (const key of ['equippedActive', 'equippedPassive']) {
      const eq = s.items[key].find((e) => e.id === id);
      if (eq) eq.level = lvl + 1;
    }
    persist();
    Audio.coin();
    Toast.show(ITEMS[id].name + ' 升至 Lv' + (lvl + 1));
  }

  sell(id) {
    const s = getSave();
    const lvl = s.items.owned[id];
    const gain = sellPrice(id, lvl);
    for (const key of ['equippedActive', 'equippedPassive']) {
      const list = s.items[key];
      const idx = list.findIndex((e) => e.id === id);
      if (idx >= 0) list.splice(idx, 1);
    }
    delete s.items.owned[id];
    addGold(gain);
    persist();
    Audio.coin();
    Toast.show('出售 ' + ITEMS[id].name + '，+' + gain + ' 金');
  }

  update(dt) { Toast.update(dt); }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    const ids = this.ownedIds();
    for (let i = 0; i < ids.length; i++) {
      const rowY = 280 + i * 140;
      if (y < rowY + 76 || y > rowY + 118) continue;
      // 三个操作按钮：装备/卸下、升级、出售
      if (x >= 250 && x <= 360) return this.toggleEquip(ids[i]);
      if (x >= 372 && x <= 500) return this.upgrade(ids[i]);
      if (x >= 512 && x <= 640) return this.sell(ids[i]);
    }
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '背 包');
    this.btnBack.draw(ctx);

    const s = getSave();
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText('金币 ' + s.gold, 700, 70);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8895a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText(`已装备：主动 ${s.items.equippedActive.length}/${MAX_ACTIVE} · 被动 ${s.items.equippedPassive.length}/${MAX_PASSIVE}`, 60, 210);
    ctx.restore();

    const ids = this.ownedIds();
    if (ids.length === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6a5a42';
      ctx.font = '28px KaiTi, STKaiti, serif';
      ctx.fillText('背包空空如也，去商城或抽奖看看吧', 375, 600);
      ctx.restore();
    }

    ctx.save();
    ids.forEach((id, i) => {
      const y = 280 + i * 140;
      const item = ITEMS[id];
      const lvl = s.items.owned[id];
      const equipped = this.isEquipped(id);
      ctx.fillStyle = 'rgba(50, 38, 24, 0.7)';
      ctx.fillRect(60, y, 621, 124);
      ctx.strokeStyle = equipped ? '#e8c35a' : '#6a5232';
      ctx.lineWidth = equipped ? 3 : 1;
      ctx.strokeRect(60, y, 621, 124);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '28px KaiTi, STKaiti, serif';
      ctx.fillText(item.name + ' Lv' + lvl, 80, y + 30);
      ctx.fillStyle = '#a8895a';
      ctx.font = '20px KaiTi, STKaiti, serif';
      const kindLabel = item.kind === 'active' ? '主动' : '被动';
      ctx.fillText('【' + kindLabel + '】' + item.descAt(lvl), 80, y + 60);

      // 按钮组
      this.drawOp(ctx, 250, y + 76, 110, 42, equipped ? '卸下' : '装备', '#3a4a2a');
      this.drawOp(ctx, 372, y + 76, 128, 42, '升 ' + upgradeCost(id, lvl) + '金', '#5a3a28');
      this.drawOp(ctx, 512, y + 76, 128, 42, '卖 ' + sellPrice(id, lvl) + '金', '#4a2a28');
    });
    ctx.restore();

    Toast.render(ctx);
  }

  drawOp(ctx, x, y, w, h, label, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c9a86a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }
}
