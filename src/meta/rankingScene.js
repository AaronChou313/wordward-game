import { Button } from '../ui/button.js';
import { getCurrentUser } from '../net/apiClient.js';
import { getLeaderboard, getMyRank } from '../net/meritClient.js';

export class RankingScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.rows = [];
    this.nextCursor = null;
    this.cursors = [null];
    this.page = 0;
    this.loading = false;
    this.error = '';
    this.me = null;
    this.images = new Map();
    this.back = new Button(35, 30, 125, 56, '返回', () => scenes.switch('home'), { fontSize: 25 });
    this.refresh = new Button(590, 30, 125, 56, '刷新', () => this.loadPage(this.cursors[this.page]), { fontSize: 25 });
    this.prev = new Button(90, 1180, 240, 64, '上一页', () => this.previousPage(), { fontSize: 26 });
    this.next = new Button(420, 1180, 240, 64, '下一页', () => this.nextPage(), { fontSize: 26 });
  }

  enter() {
    this.lifecycle = {};
    this.page = 0;
    this.cursors = [null];
    this.me = null;
    this.loadPage(null);
    if (getCurrentUser()) this.loadMe();
  }

  exit() { this.lifecycle = null; }
  update() {}

  async loadPage(cursor) {
    if (this.loading) return;
    const lifecycle = this.lifecycle;
    this.loading = true;
    this.error = '';
    this.rows = [];
    try {
      const result = await getLeaderboard(cursor, 10);
      if (this.lifecycle !== lifecycle) return;
      this.rows = result.rows;
      this.nextCursor = result.nextCursor;
      for (const row of this.rows) this.prepareAvatar(row.avatarUrl);
    } catch (error) {
      if (this.lifecycle === lifecycle) this.error = error.message || '排行榜读取失败';
    } finally {
      if (this.lifecycle === lifecycle) this.loading = false;
    }
  }

  async loadMe() {
    const lifecycle = this.lifecycle;
    try {
      const me = await getMyRank();
      if (this.lifecycle === lifecycle) this.me = me;
    } catch { /* 全服榜仍可匿名查看 */ }
  }

  nextPage() {
    if (!this.nextCursor || this.loading) return;
    this.page++;
    this.cursors[this.page] = this.nextCursor;
    this.loadPage(this.nextCursor);
  }

  previousPage() {
    if (this.page <= 0 || this.loading) return;
    this.page--;
    this.loadPage(this.cursors[this.page]);
  }

  prepareAvatar(url) {
    if (!url || this.images.has(url) || typeof Image === 'undefined') return;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => { image.ready = true; };
    image.onerror = () => { image.failed = true; };
    image.src = url;
    this.images.set(url, image);
  }

  onPointerDown(x, y) {
    if (this.back.hitTest(x, y)) return this.back.onClick();
    if (this.refresh.hitTest(x, y)) return this.refresh.onClick();
    if (this.prev.hitTest(x, y)) return this.prev.onClick();
    if (this.next.hitTest(x, y)) return this.next.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209'; ctx.fillRect(0, 0, 750, 1334);
    this.back.draw(ctx); this.refresh.draw(ctx);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8c35a'; ctx.font = 'bold 54px KaiTi, serif';
    ctx.fillText('全服军功榜', 375, 165);
    ctx.fillStyle = '#a8895a'; ctx.font = '22px KaiTi, serif';
    ctx.fillText(this.me ? ownRankText(this.me) : (getCurrentUser() ? '正在读取我的名次…' : '登录后可显示并高亮本人名次'), 375, 215);

    if (this.loading && this.rows.length === 0) drawMessage(ctx, '正在读取排行榜…', '#e8c35a');
    else if (this.error) drawMessage(ctx, this.error, '#e08a78');
    else if (this.rows.length === 0) drawMessage(ctx, '尚无已验证军功记录', '#a8895a');
    else this.rows.forEach((row, index) => this.drawRow(ctx, row, index));

    this.prev.draw(ctx); this.next.draw(ctx);
    ctx.fillStyle = '#8a6a42'; ctx.font = '20px KaiTi, serif'; ctx.textAlign = 'center';
    ctx.fillText(`第 ${this.page + 1} 页`, 375, 1220);
  }

  drawRow(ctx, row, index) {
    const y = 260 + index * 84;
    const own = getCurrentUser() && row.userId === getCurrentUser().id;
    ctx.fillStyle = own ? 'rgba(122, 42, 32, 0.72)' : 'rgba(50, 38, 24, 0.82)';
    ctx.fillRect(55, y, 640, 68);
    ctx.strokeStyle = own ? '#e8c35a' : '#6f5436'; ctx.lineWidth = own ? 3 : 1; ctx.strokeRect(55, y, 640, 68);
    drawAvatar(ctx, this.images.get(row.avatarUrl), 100, y + 34);
    ctx.textAlign = 'center'; ctx.fillStyle = row.rank <= 3 ? '#ffd75a' : '#c9a86a'; ctx.font = 'bold 27px KaiTi, serif';
    ctx.fillText(String(row.rank), 165, y + 43);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f0d8a8'; ctx.font = '26px KaiTi, serif';
    ctx.fillText(row.nickname, 220, y + 43);
    ctx.textAlign = 'right'; ctx.fillStyle = '#a8d8a0'; ctx.font = 'bold 25px KaiTi, serif';
    ctx.fillText(`${row.merit} 军功`, 665, y + 43);
  }
}

function drawAvatar(ctx, image, x, y) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#6f5436'; ctx.fillRect(x - 24, y - 24, 48, 48);
  if (image && image.ready) ctx.drawImage(image, x - 24, y - 24, 48, 48);
  else {
    ctx.fillStyle = '#e8c35a'; ctx.font = 'bold 30px KaiTi, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('主', x, y + 2);
  }
  ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawMessage(ctx, message, color) {
  ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = '28px KaiTi, serif'; ctx.fillText(message, 375, 620);
}

function ownRankText(me) {
  return me.rank == null ? `我的军功：${me.merit} · 尚未上榜` : `我的名次：第 ${me.rank} 名 · ${me.merit} 军功`;
}
