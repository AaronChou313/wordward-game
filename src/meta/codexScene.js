// 图鉴：普通文字 / 增益文字 / 进阶词组，摆放或组成即解锁
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { CODEX_CATS, CODEX_SET_BONUS } from '../config/codex.js';
import { BASE_UNITS, ADV_CHARS } from '../config/units.js';
import { PREFIX_BUFFS, HEROES } from '../config/words.js';
import { getSave } from './saveData.js';

export class CodexScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
  }

  enter() {}
  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}
  update(dt) { Toast.update(dt); }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '图 鉴');
    this.btnBack.draw(ctx);

    const save = getSave();
    let y = 210;

    for (const cat of CODEX_CATS) {
      const unlocked = save.codex[cat.id] || [];
      const done = cat.keys.every((k) => unlocked.includes(k));

      // 分类标题
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '30px KaiTi, STKaiti, serif';
      ctx.fillText(cat.name + '  ' + unlocked.length + '/' + cat.keys.length, 60, y);
      ctx.fillStyle = done ? '#7fe08a' : '#6a5a42';
      ctx.font = '22px KaiTi, STKaiti, serif';
      ctx.textAlign = 'right';
      ctx.fillText(done ? '已集齐 +' + CODEX_SET_BONUS[cat.id] + ' 金' : '集齐奖励 ' + CODEX_SET_BONUS[cat.id] + ' 金', 690, y);
      ctx.restore();
      y += 46;

      // 条目网格（每行 6 个）
      const cellW = 100, gap = 8;
      cat.keys.forEach((key, i) => {
        const cx = 60 + (i % 6) * (cellW + gap);
        const cy = y + Math.floor(i / 6) * (cellW + gap);
        const has = unlocked.includes(key);
        ctx.save();
        ctx.fillStyle = has ? 'rgba(60, 46, 26, 0.9)' : 'rgba(30, 24, 18, 0.8)';
        ctx.fillRect(cx, cy, cellW, cellW);
        ctx.strokeStyle = has ? '#c9a86a' : '#3a322a';
        ctx.lineWidth = has ? 2 : 1;
        ctx.strokeRect(cx, cy, cellW, cellW);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (has) {
          let color = '#e8c35a';
          if (cat.id === 'base') color = BASE_UNITS[key].color;
          else if (cat.id === 'prefix') color = (ADV_CHARS[key] || {}).color || '#e8c35a';
          else if (cat.id === 'hero') color = (HEROES[key] || {}).color || '#e8c35a';
          ctx.fillStyle = color;
          ctx.font = (cat.id === 'hero' ? 'bold 30px' : 'bold 44px') + ' KaiTi, STKaiti, serif';
          ctx.fillText(key, cx + cellW / 2, cy + cellW / 2 - (cat.id !== 'hero' ? 6 : 0));
          if (cat.id === 'prefix') {
            ctx.fillStyle = '#a8895a';
            ctx.font = '16px KaiTi, STKaiti, serif';
            ctx.fillText(PREFIX_BUFFS[key].label, cx + cellW / 2, cy + cellW - 16);
          }
        } else {
          ctx.fillStyle = '#4a4038';
          ctx.font = 'bold 40px KaiTi, STKaiti, serif';
          ctx.fillText('？', cx + cellW / 2, cy + cellW / 2);
        }
        ctx.restore();
      });
      y += Math.ceil(cat.keys.length / 6) * (cellW + gap) + 36;
    }

    // 说明
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6a5a42';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.fillText('在战斗中摆放文字、组成词组即可解锁对应图鉴并获得金币', 375, 1250);
    ctx.restore();

    Toast.render(ctx);
  }
}
