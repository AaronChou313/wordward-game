// 玩法帮助：全屏可滚动面板，分节介绍将士/刷新铲子/军功进阶/装备货币
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';

const TAP_DIST = 10;

// 滚动区域（剪裁窗口）：正文从 CLIP_TOP 开始、高 CLIP_H。
// 注：相比 brief 原稿，将剪裁高度由 1040 收窄为 780，使正文（约 852px）
// 真正超出可视区，滚动才有效；maxScroll 依实际几何计算而非写死 1100。
const CLIP_TOP = 200;
const CLIP_H = 780;

const SECTIONS = [
  { title: '一、基本将士', lines: [
    '兵：近战单体，可驻守哨站阻挡敌军',
    '骑：圆形范围攻击，可驻守哨站',
    '枪：直线穿透攻击，可驻守哨站',
    '弓：远程单体，可驻守哨站',
    '炮：远程范围攻击，可驻守哨站',
    '增益字（精/铁/神…）：放到文字旁激活增益',
    '进阶字组词可召唤武将（赵云/吕布等）',
  ] },
  { title: '二、刷新与铲子', lines: [
    '将士栏固定 5 格，点击刷新补充文字',
    '刷新有冷却，击杀敌军可缩短冷却',
    '铲子可激活棋盘上被封锁的格位',
    '每次刷新有几率掉落铲子，连续未掉必得',
  ] },
  { title: '三、军功与进阶', lines: [
    '击败每 30 波的 Boss 可获得军功',
    '军功用于解锁更高难度与无尽楼层',
    '相邻文字组词可触发进阶与武将效果',
  ] },
  { title: '四、装备与货币', lines: [
    '金币：商城买道具、升级道具、抽奖',
    '宝石：装备/武器强化升级',
    '魂玉：装备洗练，刷新附加词条',
    '装备分系列，同系列 2/3 件触发羁绊',
  ] },
];

export class HelpScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.scroll = 0;
    this.press = null;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
  }

  enter() { this.scroll = 0; this.press = null; }

  maxScroll() {
    const total = SECTIONS.reduce((sum, s) => sum + 40 + s.lines.length * 34 + 20, 0);
    return Math.max(0, 240 + total - (CLIP_TOP + CLIP_H));
  }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (x >= 50 && x <= 700 && y >= CLIP_TOP) {
      this.press = { x, y, scroll: this.scroll, moved: false };
    }
  }

  onPointerMove(_x, y) {
    if (!this.press) return;
    if (Math.abs(y - this.press.y) > TAP_DIST) this.press.moved = true;
    if (!this.press.moved) return;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), this.press.scroll + this.press.y - y));
  }

  onPointerUp() { this.press = null; }

  update(dt) { Toast.update(dt); }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '玩法说明');
    this.btnBack.draw(ctx);

    ctx.save();
    ctx.beginPath();
    ctx.rect(50, CLIP_TOP, 650, CLIP_H);
    ctx.clip();
    ctx.translate(0, -this.scroll);

    let y = 240;
    ctx.textAlign = 'left';
    for (const section of SECTIONS) {
      ctx.fillStyle = '#e8c35a';
      ctx.font = '28px KaiTi, STKaiti, serif';
      ctx.fillText(section.title, 80, y);
      y += 40;
      ctx.fillStyle = '#f0d8a8';
      ctx.font = '22px KaiTi, STKaiti, serif';
      for (const line of section.lines) {
        ctx.fillText(line, 80, y);
        y += 34;
      }
      y += 20;
    }
    ctx.restore();

    Toast.render(ctx);
  }
}
