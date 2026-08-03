// 主页：难度选择 + 出征 + 商城/背包/抽奖/装备/图鉴入口
import { Button } from '../ui/button.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { getSave, persist } from './saveData.js';
import { availableDiffs } from '../config/difficulty.js';

export class HomeScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnPrev = new Button(175, 548, 60, 60, '‹', () => this.cycleDiff(-1), { fontSize: 36 });
    this.btnNext = new Button(515, 548, 60, 60, '›', () => this.cycleDiff(1), { fontSize: 36 });
    this.buttons = [
      new Button(175, 640, 400, 90, '出 征', () => { Audio.click(); scenes.switch('battle'); }, { fontSize: 44, bg: '#7a2a20' }),
      new Button(175, 760, 400, 76, '商 城', () => { Audio.click(); scenes.switch('shop'); }, { fontSize: 34 }),
      new Button(175, 850, 400, 76, '背 包', () => { Audio.click(); scenes.switch('inventory'); }, { fontSize: 34 }),
      new Button(175, 940, 400, 76, '抽 奖', () => { Audio.click(); scenes.switch('gacha'); }, { fontSize: 34 }),
      new Button(175, 1030, 195, 76, '装 备', () => { Audio.click(); scenes.switch('equip'); }, { fontSize: 34 }),
      new Button(380, 1030, 195, 76, '图 鉴', () => { Audio.click(); scenes.switch('codex'); }, { fontSize: 34 }),
      new Button(175, 1120, 195, 76, '排 行', () => { Audio.click(); scenes.switch('ranking'); }, { fontSize: 30 }),
      new Button(380, 1120, 195, 76, '账 号', () => { Audio.click(); scenes.switch('account'); }, { fontSize: 30 }),
    ];
  }

  enter() {}

  options() {
    return availableDiffs(getSave().diff);
  }

  selectedIndex() {
    const sel = getSave().diff.selected;
    const opts = this.options();
    const idx = opts.findIndex((o) => o.id === sel.id && (o.id !== 'endless' || o.floor === sel.floor));
    return idx >= 0 ? idx : 0;
  }

  cycleDiff(dir) {
    const save = getSave();
    const opts = this.options();
    const idx = (this.selectedIndex() + dir + opts.length) % opts.length;
    const o = opts[idx];
    save.diff.selected = o.id === 'endless' ? { id: 'endless', floor: o.floor } : { id: o.id };
    persist();
    Audio.click();
  }

  update(dt) { Toast.update(dt); }

  onPointerDown(x, y) {
    if (this.btnPrev.hitTest(x, y)) return this.btnPrev.onClick();
    if (this.btnNext.hitTest(x, y)) return this.btnNext.onClick();
    for (const b of this.buttons) if (b.hitTest(x, y)) return b.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);

    // 标题
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c35a';
    ctx.font = 'bold 96px KaiTi, STKaiti, serif';
    ctx.shadowColor = '#7a4a20';
    ctx.shadowBlur = 24;
    ctx.fillText('三国塔防', 375, 260);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a8895a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText('—— 文字为将 · 组词破敌 ——', 375, 330);

    // 状态栏
    const save = getSave();
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText('金币 ' + save.gold, 375, 420);
    ctx.fillStyle = '#a8d8a0';
    ctx.font = '26px KaiTi, STKaiti, serif';
    ctx.fillText('最高纪录：坚守 ' + save.bestWave + ' 波', 375, 465);
    ctx.restore();

    // 难度选择
    const opts = this.options();
    const cur = opts[this.selectedIndex()];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(50, 38, 24, 0.8)';
    ctx.fillRect(245, 548, 260, 60);
    ctx.strokeStyle = '#c9a86a';
    ctx.lineWidth = 2;
    ctx.strokeRect(245, 548, 260, 60);
    ctx.fillStyle = '#ffd75a';
    ctx.font = '32px KaiTi, STKaiti, serif';
    ctx.fillText(cur.name, 375, 580);
    ctx.fillStyle = '#6a5a42';
    ctx.font = '20px KaiTi, STKaiti, serif';
    ctx.fillText('难度（通关低难度可解锁更高）', 375, 532);
    ctx.restore();
    this.btnPrev.draw(ctx);
    this.btnNext.draw(ctx);

    for (const b of this.buttons) b.draw(ctx);

    // 底部提示
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6a5a42';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText('拖拽文字到发光格子布阵，相邻组词可激活进阶之力', 375, 1240);
    ctx.restore();

    Toast.render(ctx);
  }
}
