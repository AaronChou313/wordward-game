// 背包：装备/卸下/升级/出售；上限 3 主动 + 6 被动
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { ITEMS, MAX_ACTIVE, MAX_PASSIVE, upgradeCost, sellPrice } from '../config/items.js';
import { getSave, spendGold, addGold, persist } from './saveData.js';

export function inventoryItemPresentation(item, level) {
  const active = item.kind === 'active';
  return {
    border: active ? '#c98ab8' : '#79b8a8',
    heading: active
      ? `主动战术 · ${item.castMode === 'target' ? '拖拽施放' : '点击施放'}`
      : '被动军略 · 持续生效',
    detail: item.descAt(level),
  };
}

export class InventoryScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.scroll = 0;
    this.press = null;
    this.barHits = []; // 已装备栏各道具命中区域 [{id, x, w}]，渲染时记录，供点击卸下
  }

  enter() {
    this.scroll = 0;
    this.press = null;
  }

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
    if (x >= 50 && x <= 700 && y >= 255 && y <= 1195) {
      this.press = { x, y, scroll: this.scroll, moved: false };
    }
  }

  onPointerMove(_x, y) {
    if (!this.press) return;
    if (Math.abs(y - this.press.y) > 10) this.press.moved = true;
    if (!this.press.moved) return;
    const next = this.press.scroll + this.press.y - y;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), next));
  }

  onPointerUp(x, y) {
    const press = this.press;
    this.press = null;
    if (!press || press.moved) return;

    // 点击已装备栏：命中某个道具则卸下
    if (y >= 255 && y <= 290) {
      for (const h of this.barHits) {
        if (x >= h.x && x <= h.x + h.w) return this.toggleEquip(h.id);
      }
      return;
    }

    const ids = this.ownedIds();
    for (let i = 0; i < ids.length; i++) {
      const rowY = 320 + i * 150 - this.scroll;
      if (y < rowY + 96 || y > rowY + 132) continue;
      // 三个操作按钮：装备/卸下、升级、出售
      if (x >= 250 && x <= 360) return this.toggleEquip(ids[i]);
      if (x >= 372 && x <= 500) return this.upgrade(ids[i]);
      if (x >= 512 && x <= 640) return this.sell(ids[i]);
    }
  }

  maxScroll() {
    return Math.max(0, this.ownedIds().length * 150 - 840);
  }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '道 具');
    this.btnBack.draw(ctx);

    const s = getSave();
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText(`金币 ${s.gold} · 宝石 ${s.gems || 0} · 魂玉 ${s.soulJade || 0}`, 700, 70);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c98ab8';
    ctx.font = '20px KaiTi, STKaiti, serif';
    ctx.fillText(`主动战术 ${s.items.equippedActive.length}/${MAX_ACTIVE} · 点击/拖拽后在战斗中施放`, 60, 205);
    ctx.fillStyle = '#79b8a8';
    ctx.fillText(`被动军略 ${s.items.equippedPassive.length}/${MAX_PASSIVE} · 装备后持续生效，无需操作`, 60, 235);
    ctx.restore();

    // 已装备栏：固定于列表上方，列出当前装备的主动+被动道具，点击可卸下
    const equippedActive = s.items.equippedActive.map((e) => ITEMS[e.id].name);
    const equippedPassive = s.items.equippedPassive.map((e) => ITEMS[e.id].name);
    const equippedNames = equippedActive.concat(equippedPassive);
    const barText = equippedNames.join('、') || '（无）';
    this.barHits = [];
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd75a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText('已装备', 60, 272);
    ctx.fillStyle = '#f0d8a8';
    if (equippedNames.length > 0) {
      let x = 150;
      equippedNames.forEach((name, i) => {
        ctx.fillText(name, x, 272);
        const w = ctx.measureText(name).width || name.length * 22;
        this.barHits.push({ id: equippedActive[i] !== undefined ? s.items.equippedActive[i].id : s.items.equippedPassive[i - equippedActive.length].id, x, w });
        x += w + 12;
      });
    } else {
      ctx.fillText(barText, 150, 272);
    }
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
    ctx.beginPath();
    ctx.rect(50, 291, 650, 940);
    ctx.clip();
    ctx.translate(0, -this.scroll);
    ids.forEach((id, i) => {
      const y = 320 + i * 150;
      const item = ITEMS[id];
      const lvl = s.items.owned[id];
      const equipped = this.isEquipped(id);
      const presentation = inventoryItemPresentation(item, lvl);
      ctx.fillStyle = item.kind === 'active' ? 'rgba(58, 30, 48, 0.72)' : 'rgba(27, 53, 48, 0.72)';
      ctx.fillRect(60, y, 621, 136);
      ctx.strokeStyle = equipped ? '#ffd75a' : presentation.border;
      ctx.lineWidth = equipped ? 3 : 1;
      ctx.strokeRect(60, y, 621, 136);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '26px KaiTi, STKaiti, serif';
      ctx.fillText(item.name + ' Lv' + lvl, 80, y + 24);
      ctx.fillStyle = presentation.border;
      ctx.font = '18px KaiTi, STKaiti, serif';
      ctx.fillText(presentation.heading, 80, y + 52);
      ctx.fillStyle = '#a8895a';
      ctx.fillText(presentation.detail, 80, y + 76);

      // 按钮组
      this.drawOp(ctx, 250, y + 96, 110, 36, equipped ? '卸下' : '装备', '#3a4a2a');
      this.drawOp(ctx, 372, y + 96, 128, 36, '升 ' + upgradeCost(id, lvl) + '金', '#5a3a28');
      this.drawOp(ctx, 512, y + 96, 128, 36, '卖 ' + sellPrice(id, lvl) + '金', '#4a2a28');
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
