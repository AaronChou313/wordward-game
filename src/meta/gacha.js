// 抽奖池：抽进阶文字与道具
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { GACHA_COST, GACHA_CHAR_WEIGHT } from '../config/economy.js';
import { ADV_CHARS } from '../config/units.js';
import { ITEMS } from '../config/items.js';
import { getSave, spendGold, unlockChar, persist } from './saveData.js';

export class GachaScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.btnPull = new Button(225, 820, 300, 80, '抽取 ' + GACHA_COST + ' 金', () => this.pull(), { fontSize: 32, bg: '#6a4a1a' });
    this.result = null;
    this.resultTimer = 0;
  }

  enter() { this.result = null; }

  pull() {
    const save = getSave();
    if (!spendGold(GACHA_COST)) return Toast.show('金币不足');
    Audio.coin();
    if (Math.random() < GACHA_CHAR_WEIGHT) {
      const locked = Object.keys(ADV_CHARS).filter((c) => !save.unlockedChars.includes(c));
      if (locked.length === 0) {
        // 字已集齐，返还一半
        save.gold += Math.floor(GACHA_COST / 2);
        persist();
        this.result = '进阶字已集齐，返还 ' + Math.floor(GACHA_COST / 2) + ' 金';
      } else {
        const char = locked[Math.floor(Math.random() * locked.length)];
        unlockChar(char);
        this.result = '获得进阶字「' + char + '」';
      }
    } else {
      const ids = Object.keys(ITEMS);
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (save.items.owned[id]) {
        save.items.owned[id]++;
        const eq = save.items.equippedActive.concat(save.items.equippedPassive).find((e) => e.id === id);
        if (eq) eq.level = save.items.owned[id];
        this.result = ITEMS[id].name + ' 升至 Lv' + save.items.owned[id];
      } else {
        save.items.owned[id] = 1;
        this.result = '获得道具 ' + ITEMS[id].name;
      }
      persist();
    }
    this.resultTimer = 3;
    Audio.hero();
  }

  update(dt) {
    Toast.update(dt);
    if (this.resultTimer > 0) this.resultTimer -= dt;
  }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (this.btnPull.hitTest(x, y)) return this.btnPull.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '抽 奖');
    this.btnBack.draw(ctx);

    const save = getSave();
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText('金币 ' + save.gold, 700, 70);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#a8895a';
    ctx.font = '26px KaiTi, STKaiti, serif';
    ctx.fillText('奖池：进阶文字 60% · 道具 40%', 375, 400);
    ctx.fillText('已解锁进阶字 ' + save.unlockedChars.length + '/' + Object.keys(ADV_CHARS).length, 375, 450);

    // 已解锁字展示
    ctx.fillStyle = '#e8c35a';
    ctx.font = '34px KaiTi, STKaiti, serif';
    ctx.fillText(save.unlockedChars.join('  '), 375, 540);
    ctx.restore();

    this.btnPull.draw(ctx);

    if (this.result && this.resultTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75a';
      ctx.font = '36px KaiTi, STKaiti, serif';
      ctx.shadowColor = '#7a4a20';
      ctx.shadowBlur = 16;
      ctx.fillText(this.result, 375, 700);
      ctx.restore();
    }

    Toast.render(ctx);
  }
}
