// 图鉴：分类网格、解锁状态与可滚动详情面板
import { Button, roundRect } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { CODEX_CATS, CODEX_SET_BONUS } from '../config/codex.js';
import { BASE_UNITS, ADV_CHARS } from '../config/units.js';
import { HEROES } from '../config/words.js';
import { ITEMS } from '../config/items.js';
import { BOSS_ENEMIES, ELITE_ENEMIES } from '../config/enemies.js';
import { detailFor, detailPresentation, isCodexUnlocked } from './codexDetails.js';
import { getSave } from './saveData.js';

const LIST_TOP = 180;
const LIST_BOTTOM = 1218;
const CELL_W = 116;
const CELL_H = 96;
const CELL_GAP = 10;
const CELL_COLS = 5;

export class CodexScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.enter();
  }

  enter() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.detail = null;
    this.detailScroll = 0;
    this.detailMaxScroll = 0;
    this.cells = [];
    this.drag = null;
  }

  onPointerDown(x, y) {
    if (this.detail) {
      if (x >= 612 && x <= 668 && y >= 202 && y <= 252) {
        this.detail = null;
        this.detailScroll = 0;
        Audio.click();
        return;
      }
      this.drag = { mode: 'detail', startY: y, lastY: y, moved: false };
      return;
    }
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (y >= LIST_TOP && y <= LIST_BOTTOM) {
      this.drag = { mode: 'list', startY: y, lastY: y, moved: false };
    }
  }

  onPointerMove(_x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.lastY;
    if (Math.abs(y - this.drag.startY) > 8) this.drag.moved = true;
    if (this.drag.moved) {
      if (this.drag.mode === 'detail') {
        this.detailScroll = clamp(this.detailScroll - dy, 0, this.detailMaxScroll);
      } else {
        this.scroll = clamp(this.scroll - dy, 0, this.maxScroll);
      }
    }
    this.drag.lastY = y;
  }

  onPointerUp(x, y) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (drag.moved || drag.mode !== 'list') return;
    const cell = this.cells.find((entry) => (
      x >= entry.x && x <= entry.x + entry.w
      && y >= entry.y && y <= entry.y + entry.h
      && entry.y + entry.h >= LIST_TOP && entry.y <= LIST_BOTTOM
    ));
    if (!cell) return;
    const full = detailFor(cell.category, cell.key);
    this.detail = detailPresentation(full, cell.unlocked);
    this.detailScroll = 0;
    Audio.click();
  }

  update(dt) { Toast.update(dt); }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '图 鉴');
    this.btnBack.draw(ctx);

    ctx.save();
    ctx.beginPath();
    ctx.rect(35, LIST_TOP, 680, LIST_BOTTOM - LIST_TOP);
    ctx.clip();
    ctx.translate(0, -this.scroll);
    this.renderGrid(ctx, getSave());
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6a5a42';
    ctx.font = '20px KaiTi, STKaiti, serif';
    ctx.fillText(this.maxScroll > 0 ? '上下拖动浏览 · 点击条目查看详情' : '点击条目查看详情', 375, 1252);
    ctx.restore();

    if (this.detail) this.renderDetail(ctx);
    Toast.render(ctx);
  }

  renderGrid(ctx, save) {
    this.cells = [];
    let y = 194;

    for (const cat of CODEX_CATS) {
      const unlockedKeys = cat.keys.filter((key) => isCodexUnlocked(cat.id, key, save));
      const done = cat.keys.length > 0 && unlockedKeys.length === cat.keys.length;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '28px KaiTi, STKaiti, serif';
      ctx.fillText(`${cat.name}  ${unlockedKeys.length}/${cat.keys.length}`, 60, y);
      const bonus = CODEX_SET_BONUS[cat.id] || 0;
      if (bonus > 0) {
        ctx.fillStyle = done ? '#7fe08a' : '#6a5a42';
        ctx.font = '20px KaiTi, STKaiti, serif';
        ctx.textAlign = 'right';
        ctx.fillText(done ? `已集齐 +${bonus} 金` : `集齐奖励 ${bonus} 金`, 690, y);
      }
      ctx.restore();
      y += 38;

      cat.keys.forEach((key, index) => {
        const cx = 60 + (index % CELL_COLS) * (CELL_W + CELL_GAP);
        const cy = y + Math.floor(index / CELL_COLS) * (CELL_H + CELL_GAP);
        const unlocked = isCodexUnlocked(cat.id, key, save);
        this.cells.push({ category: cat.id, key, unlocked, x: cx, y: cy - this.scroll, w: CELL_W, h: CELL_H });
        this.renderCell(ctx, cat.id, key, unlocked, cx, cy);
      });

      y += Math.ceil(cat.keys.length / CELL_COLS) * (CELL_H + CELL_GAP) + 28;
    }
    this.maxScroll = Math.max(0, y - LIST_BOTTOM + 24);
    this.scroll = clamp(this.scroll, 0, this.maxScroll);
  }

  renderCell(ctx, category, key, unlocked, x, y) {
    ctx.save();
    ctx.fillStyle = unlocked ? 'rgba(60, 46, 26, 0.9)' : 'rgba(30, 24, 18, 0.88)';
    ctx.strokeStyle = unlocked ? '#c9a86a' : '#3a322a';
    ctx.lineWidth = unlocked ? 2 : 1;
    ctx.beginPath();
    roundRect(ctx, x, y, CELL_W, CELL_H, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!unlocked) {
      ctx.fillStyle = '#4a4038';
      ctx.font = 'bold 38px KaiTi, STKaiti, serif';
      ctx.fillText('？', x + CELL_W / 2, y + CELL_H / 2 - 8);
      ctx.fillStyle = '#675a49';
      ctx.font = '16px KaiTi, STKaiti, serif';
      ctx.fillText('点击查看线索', x + CELL_W / 2, y + CELL_H - 15);
      ctx.restore();
      return;
    }

    const detail = detailFor(category, key);
    const label = detail.title.replace(/（.*$/, '');
    ctx.fillStyle = entryColor(category, key);
    ctx.font = `${category === 'base' || category === 'prefix' ? 'bold 42px' : 'bold 24px'} KaiTi, STKaiti, serif`;
    ctx.fillText(label, x + CELL_W / 2, y + CELL_H / 2 - 7);
    ctx.fillStyle = '#a8895a';
    ctx.font = '16px KaiTi, STKaiti, serif';
    ctx.fillText(categoryLabel(category), x + CELL_W / 2, y + CELL_H - 15);
    ctx.restore();
  }

  renderDetail(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 6, 3, 0.76)';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 55, 170, 640, 990, this.detail.title);

    ctx.fillStyle = '#4b3124';
    ctx.strokeStyle = '#c9a86a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, 612, 202, 56, 50, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f0d8a8';
    ctx.font = 'bold 28px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', 640, 227);

    ctx.beginPath();
    ctx.rect(82, 278, 586, 810);
    ctx.clip();
    ctx.translate(0, -this.detailScroll);
    let y = 302;
    if (this.detail.locked) {
      ctx.fillStyle = '#8f795d';
      ctx.font = 'bold 30px KaiTi, STKaiti, serif';
      ctx.textAlign = 'center';
      ctx.fillText('尚未解锁', 375, y);
      y += 66;
    } else {
      ctx.textAlign = 'left';
      ctx.font = '24px KaiTi, STKaiti, serif';
      for (const entry of this.detail.rows) {
        ctx.fillStyle = '#a8895a';
        ctx.fillText(entry.label, 105, y);
        ctx.fillStyle = '#f0d8a8';
        const valueBottom = drawWrapped(ctx, entry.value, 285, y, 350, 32);
        y = Math.max(y + 44, valueBottom + 8);
      }
      y += 22;
      ctx.fillStyle = '#d6c29a';
      ctx.font = '23px KaiTi, STKaiti, serif';
      y = drawWrapped(ctx, this.detail.description, 105, y, 530, 34);
      y += 28;
    }

    ctx.fillStyle = this.detail.locked ? '#e8c35a' : '#7fa58d';
    ctx.font = '22px KaiTi, STKaiti, serif';
    ctx.textAlign = 'left';
    y = drawWrapped(ctx, `获取线索：${this.detail.hint}`, 105, y, 530, 32);
    this.detailMaxScroll = Math.max(0, y - 1042);
    this.detailScroll = clamp(this.detailScroll, 0, this.detailMaxScroll);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#6a5a42';
    ctx.font = '19px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    if (this.detailMaxScroll > 0) ctx.fillText('上下拖动查看完整资料', 375, 1120);
    ctx.restore();
  }
}

function entryColor(category, key) {
  if (category === 'base') return BASE_UNITS[key].color;
  if (category === 'prefix') return (ADV_CHARS[key] || {}).color || '#e8c35a';
  if (category === 'hero') return (HEROES[key] || {}).color || '#e8c35a';
  if (category === 'item') return ITEMS[key].kind === 'active' ? '#c98ab8' : '#79b8a8';
  const enemy = ELITE_ENEMIES.concat(BOSS_ENEMIES).find((entry) => entry.key === key);
  return enemy ? enemy.color : '#e8c35a';
}

function categoryLabel(category) {
  return { base: '基础将士', prefix: '增益文字', hero: '进阶词组', item: '军需道具', elite: '精英敌军', boss: '敌军首领' }[category];
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  for (const char of text) {
    const candidate = line + char;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
