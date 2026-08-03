// 商城：展示战后刷新的最多四件未拥有道具；升级统一在背包完成
import { Button, roundRect } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { ITEMS } from '../config/items.js';
import { getSave, persist } from './saveData.js';
import { buyShopStockItem, ensureShopStock } from './shopStock.js';

const CARD_X = 60;
const CARD_Y = 220;
const CARD_W = 630;
const CARD_H = 210;
const CARD_GAP = 18;

export class ShopScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
  }

  enter() {
    ensureShopStock(getSave());
    persist();
  }

  buyItem(id) {
    const result = buyShopStockItem(getSave(), id);
    if (!result.purchased) {
      if (result.reason === 'gold') Toast.show('金币不足');
      else if (result.reason === 'owned') Toast.show('该道具已拥有，请在背包升级');
      else Toast.show('该商品已不在本轮库存');
      return result;
    }
    persist();
    Audio.coin();
    Toast.show(`购得 ${ITEMS[id].name}，去背包装备`);
    return result;
  }

  update(dt) { Toast.update(dt); }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    const stock = ensureShopStock(getSave());
    for (let i = 0; i < stock.length; i++) {
      const by = CARD_Y + i * (CARD_H + CARD_GAP) + 148;
      if (x >= 485 && x <= 665 && y >= by && y <= by + 46) return this.buyItem(stock[i]);
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
    const stock = ensureShopStock(save);
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText(`金币 ${save.gold}`, 700, 70);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8895a';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText(`本轮军需 ${stock.length}/4 · 战斗结算后刷新`, 60, 180);
    ctx.restore();

    if (stock.length === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6a5a42';
      ctx.font = '30px KaiTi, STKaiti, serif';
      ctx.fillText('本轮没有可购买的未拥有道具', 375, 560);
      ctx.font = '23px KaiTi, STKaiti, serif';
      ctx.fillText('完成或退出一场战斗后会刷新下一批军需', 375, 610);
      ctx.restore();
    }

    for (let i = 0; i < stock.length; i++) this.renderCard(ctx, stock[i], i, save.gold);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7b6a50';
    ctx.font = '21px KaiTi, STKaiti, serif';
    ctx.fillText('已拥有道具的升级、装备与出售均在背包完成', 375, 1225);
    ctx.restore();
    Toast.render(ctx);
  }

  renderCard(ctx, id, index, gold) {
    const item = ITEMS[id];
    const y = CARD_Y + index * (CARD_H + CARD_GAP);
    const active = item.kind === 'active';
    ctx.save();
    ctx.fillStyle = active ? 'rgba(58, 30, 48, 0.72)' : 'rgba(27, 53, 48, 0.72)';
    ctx.strokeStyle = active ? '#c98ab8' : '#79b8a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, CARD_X, y, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f0d8a8';
    ctx.font = 'bold 31px KaiTi, STKaiti, serif';
    ctx.fillText(item.name, 82, y + 35);
    ctx.fillStyle = active ? '#c98ab8' : '#79b8a8';
    ctx.font = '21px KaiTi, STKaiti, serif';
    ctx.fillText(active ? `主动战术 · ${item.castMode === 'target' ? '拖拽施放' : '点击施放'}` : '被动军略 · 持续生效', 82, y + 70);
    ctx.fillStyle = '#b9a582';
    ctx.font = '21px KaiTi, STKaiti, serif';
    drawWrapped(ctx, item.descAt(1), 82, y + 104, 375, 28);

    ctx.fillStyle = '#5a3a28';
    ctx.strokeStyle = '#c9a86a';
    ctx.beginPath();
    roundRect(ctx, 485, y + 148, 180, 46, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = gold >= item.price ? '#ffd75a' : '#777';
    ctx.font = '23px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`购买 ${item.price} 金`, 575, y + 171);
    ctx.restore();
  }
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
