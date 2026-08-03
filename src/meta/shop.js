// 商城：金币购买道具与进阶文字，道具可升级
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { ITEMS, upgradeCost } from '../config/items.js';
import { SHOP_CHAR_COST } from '../config/economy.js';
import { ADV_CHARS } from '../config/units.js';
import { getSave, spendGold, unlockChar, persist } from './saveData.js';

export class ShopScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.btnBuyChar = new Button(430, 1120, 281, 60, '进阶字', () => this.buyChar(), { fontSize: 24 });
  }

  enter() {}

  buyItem(id) {
    const save = getSave();
    const item = ITEMS[id];
    const owned = save.items.owned[id];
    if (!owned) {
      if (!spendGold(item.price)) return Toast.show('金币不足');
      save.items.owned[id] = 1;
      persist();
      Audio.coin();
      Toast.show('购得 ' + item.name + '，去背包装备');
    } else {
      const cost = upgradeCost(id, owned);
      if (!spendGold(cost)) return Toast.show('金币不足');
      save.items.owned[id] = owned + 1;
      persist();
      Audio.coin();
      Toast.show(item.name + ' 升至 Lv' + (owned + 1));
    }
  }

  buyChar() {
    const save = getSave();
    const locked = Object.keys(ADV_CHARS).filter((c) => !save.unlockedChars.includes(c));
    if (locked.length === 0) return Toast.show('已集齐全部进阶字');
    if (!spendGold(SHOP_CHAR_COST)) return Toast.show('金币不足');
    const char = locked[Math.floor(Math.random() * locked.length)];
    unlockChar(char);
    Audio.coin();
    Toast.show('获得进阶字「' + char + '」');
  }

  update(dt) { Toast.update(dt); }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (this.btnBuyChar.hitTest(x, y)) return this.btnBuyChar.onClick();
    // 商品按钮
    const ids = Object.keys(ITEMS);
    for (let i = 0; i < ids.length; i++) {
      const by = 230 + i * 140 + 76;
      if (x >= 500 && x <= 681 && y >= by && y <= by + 44) {
        return this.buyItem(ids[i]);
      }
    }
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '商 城');
    this.btnBack.draw(ctx);

    const save = getSave();
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText('金币 ' + save.gold, 700, 70);
    ctx.restore();

    const ids = Object.keys(ITEMS);
    ctx.save();
    ids.forEach((id, i) => {
      const item = ITEMS[id];
      const y = 230 + i * 140;
      const owned = save.items.owned[id] || 0;
      ctx.fillStyle = 'rgba(50, 38, 24, 0.7)';
      ctx.fillRect(60, y, 621, 120);
      ctx.strokeStyle = '#6a5232';
      ctx.strokeRect(60, y, 621, 120);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '30px KaiTi, STKaiti, serif';
      ctx.fillText(item.name + (owned > 0 ? ' Lv' + owned : ''), 80, y + 28);
      ctx.fillStyle = '#a8895a';
      ctx.font = '22px KaiTi, STKaiti, serif';
      const kindLabel = item.kind === 'active' ? '主动' : '被动';
      ctx.fillText('【' + kindLabel + '】' + item.descAt(Math.max(1, owned)), 80, y + 64);

      // 购买/升级按钮
      const isBuy = owned === 0;
      const cost = isBuy ? item.price : upgradeCost(id, owned);
      ctx.fillStyle = '#5a3a28';
      ctx.fillRect(500, y + 76, 181, 44);
      ctx.strokeStyle = '#c9a86a';
      ctx.strokeRect(500, y + 76, 181, 44);
      ctx.fillStyle = save.gold >= cost ? '#ffd75a' : '#888';
      ctx.font = '24px KaiTi, STKaiti, serif';
      ctx.textAlign = 'center';
      ctx.fillText((isBuy ? '购买 ' : '升级 ') + cost + ' 金', 590, y + 98);
    });
    ctx.restore();

    // 进阶字购买
    this.btnBuyChar.label = '进阶字 ' + SHOP_CHAR_COST + ' 金';
    this.btnBuyChar.draw(ctx);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8895a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText('随机获得一个未解锁的进阶字', 60, 1150);
    ctx.restore();

    Toast.render(ctx);
  }
}
