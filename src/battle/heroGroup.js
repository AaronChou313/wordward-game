// 英雄组：相邻进阶字拼出人名后激活
// 成员字保留在各自格子（保留各自阶/级/经验），组通过一个 puppet Tower 复用全部攻击逻辑
import { Tower } from './tower.js';
import { HEROES } from '../config/words.js';
import { CELL } from '../config/map.js';

export class HeroGroup {
  // members: 按人名顺序排列的 adv Tower 数组
  constructor(name, members) {
    this.name = name;
    this.members = members;
    for (const t of members) t.group = this;
    const first = members[0];
    this.puppet = new Tower(name[0], 1, first.c, first.r, 'hero', name);
    this.sync();
  }

  // 每帧同步：质心位置 + 成员平均阶/级
  sync() {
    let sx = 0, sy = 0, st = 0, sl = 0;
    for (const t of this.members) { sx += t.x; sy += t.y; st += t.tier; sl += t.level; }
    const n = this.members.length;
    this.puppet.x = sx / n;
    this.puppet.y = sy / n;
    this.puppet.tier = Math.max(1, Math.floor(st / n));
    this.puppet.level = Math.max(1, Math.floor(sl / n));
  }

  get x() { return this.puppet.x; }
  get y() { return this.puppet.y; }

  dissolve() {
    for (const t of this.members) t.group = null;
  }

  update(dt, ctx2) {
    this.sync();
    this.puppet.update(dt, ctx2);
  }

  // 连体渲染：成员中心粗圆角连线 + 椭圆光晕 + 组名（画在成员字下层）
  render(ctx) {
    const color = (HEROES[this.name] || {}).color || '#ffd75a';
    const pts = this.members.map((t) => ({ x: t.x, y: t.y }));
    ctx.save();

    // 椭圆光晕（以质心为中心，覆盖所有成员）
    let maxR = 0;
    for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x - this.x, p.y - this.y));
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, maxR + CELL * 0.55, maxR * 0.6 + CELL * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 粗圆角连线把成员连成一体
    if (pts.length > 1) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = CELL * 0.72;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 组名徽标（质心上方）
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.font = 'bold 30px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let topY = Infinity;
    for (const p of pts) topY = Math.min(topY, p.y);
    ctx.fillText(this.name, this.x, topY - 62);
    ctx.restore();
  }
}
