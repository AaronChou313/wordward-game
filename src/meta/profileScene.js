import { Button } from '../ui/button.js';
import { blurCanvasTextInput, focusCanvasTextInput } from '../ui/canvasTextInput.js';
import { getCurrentUser, getProfile, logout, updateProfile } from '../net/apiClient.js';

export class ProfileScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.profile = { nickname: '', avatarUrl: '', bio: '' };
    this.active = null; this.busy = false; this.message = '';
    this.back = new Button(40, 36, 130, 58, '返回', () => scenes.switch('home'), { fontSize: 26 });
    this.save = new Button(120, 850, 510, 76, '保存资料', () => this.saveProfile(), { fontSize: 32, bg: '#7a2a20' });
    this.logoutButton = new Button(120, 950, 510, 68, '退出登录', () => this.signOut(), { fontSize: 26 });
  }

  enter() { this.lifecycle = {}; this.load(); }
  exit() { this.lifecycle = null; blurCanvasTextInput(); }
  update() {}

  async load() {
    const lifecycle = this.lifecycle;
    this.busy = true; this.message = '读取资料…';
    try {
      const profile = await getProfile();
      if (this.lifecycle !== lifecycle) return;
      this.profile = { ...profile, avatarUrl: profile.avatarUrl || '' };
      this.message = '';
    } catch (error) {
      if (this.lifecycle !== lifecycle) return;
      this.message = error.message || '无法读取资料';
      if (error.status === 401) this.scenes.switch('account', { mode: 'login' });
    } finally { this.busy = false; }
  }

  focus(field) {
    this.active = field;
    const max = field === 'nickname' ? 24 : (field === 'bio' ? 200 : 2048);
    focusCanvasTextInput(this.profile[field], {
      maxLength: max,
      onInput: (value) => { this.profile[field] = value; },
      onEnter: () => this.saveProfile(),
    });
  }

  async saveProfile() {
    if (this.busy) return;
    const nickname = this.profile.nickname.trim();
    if (!nickname || Array.from(nickname).length > 24) return void (this.message = '昵称需为 1–24 个字符');
    if (Array.from(this.profile.bio).length > 200) return void (this.message = '简介不能超过 200 个字符');
    if (this.profile.avatarUrl && !this.profile.avatarUrl.startsWith('https://')) return void (this.message = '头像必须使用 HTTPS 地址');
    this.busy = true; this.message = '保存中…';
    try {
      const saved = await updateProfile({ ...this.profile, nickname, avatarUrl: this.profile.avatarUrl || null });
      this.profile = { ...saved, avatarUrl: saved.avatarUrl || '' };
      this.message = '资料已保存';
    } catch (error) { this.message = error.message || '保存失败'; }
    finally { this.busy = false; }
  }

  async signOut() {
    if (this.busy) return;
    this.busy = true;
    try { await logout(); } finally { this.busy = false; this.scenes.switch('home'); }
  }

  onPointerDown(x, y) {
    if (this.back.hitTest(x, y)) return this.back.onClick();
    if (inside(x, y, 100, 330, 550, 72)) return this.focus('nickname');
    if (inside(x, y, 100, 470, 550, 72)) return this.focus('avatarUrl');
    if (inside(x, y, 100, 610, 550, 130)) return this.focus('bio');
    if (this.save.hitTest(x, y)) return this.save.onClick();
    if (this.logoutButton.hitTest(x, y)) return this.logoutButton.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209'; ctx.fillRect(0, 0, 750, 1334); this.back.draw(ctx);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8c35a'; ctx.font = 'bold 56px KaiTi, serif'; ctx.fillText('个人资料', 375, 180);
    ctx.fillStyle = '#a8d8a0'; ctx.font = '22px KaiTi, serif';
    ctx.fillText(getCurrentUser() ? '@' + getCurrentUser().username : '正在恢复会话', 375, 230);
    drawField(ctx, 100, 330, 550, 72, '昵称', this.profile.nickname, this.active === 'nickname');
    drawField(ctx, 100, 470, 550, 72, '头像 HTTPS 地址', this.profile.avatarUrl, this.active === 'avatarUrl');
    drawField(ctx, 100, 610, 550, 130, '简介', this.profile.bio, this.active === 'bio');
    this.save.draw(ctx); this.logoutButton.draw(ctx);
    ctx.fillStyle = this.message.includes('已保存') ? '#a8d8a0' : '#e08a78'; ctx.font = '24px KaiTi, serif'; ctx.fillText(this.message, 375, 1090);
  }
}

function drawField(ctx, x, y, w, h, label, value, active) {
  ctx.textAlign = 'left'; ctx.fillStyle = '#a8895a'; ctx.font = '22px KaiTi, serif'; ctx.fillText(label, x, y - 12);
  ctx.fillStyle = '#241a12'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = active ? '#e8c35a' : '#8a6a42'; ctx.lineWidth = active ? 3 : 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#f0d8a8'; ctx.font = '24px KaiTi, serif';
  const shown = value.length > 42 ? value.slice(0, 42) + '…' : value; ctx.fillText(shown, x + 16, y + 45);
}

function inside(x, y, left, top, width, height) { return x >= left && x <= left + width && y >= top && y <= top + height; }
