import { Button } from '../ui/button.js';
import { blurCanvasTextInput, focusCanvasTextInput } from '../ui/canvasTextInput.js';
import { getCurrentUser, login, register, restoreSession } from '../net/apiClient.js';
import { authenticatedSceneName } from '../startup.js';

export function validateAccountCredentials(usernameValue, passwordValue) {
  const username = String(usernameValue || '').normalize('NFKC').trim();
  const password = String(passwordValue ?? '');
  if (Array.from(username).length < 3 || Array.from(username).length > 24) {
    return { username, password, error: '用户名需为 3–24 个字符' };
  }
  if (Array.from(password).length < 1 || Array.from(password).length > 128) {
    return { username, password, error: '密码需为 1–128 个字符' };
  }
  return { username, password, error: '' };
}

export class AccountScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.mode = 'login';
    this.username = '';
    this.password = '';
    this.active = null;
    this.busy = false;
    this.message = '';
    this.submit = new Button(150, 700, 450, 78, '登 录', () => this.submitForm(), { fontSize: 34, bg: '#7a2a20' });
    this.toggle = new Button(150, 800, 450, 68, '没有账号？前往注册', () => this.toggleMode(), { fontSize: 24 });
  }

  enter(params = {}) {
    this.lifecycle = {};
    this.busy = false;
    if (params.mode) this.mode = params.mode;
    this.password = '';
    this.message = '';
    this.syncLabels();
    if (!params.mode && getCurrentUser()) {
      this.scenes.switch('profile');
      return;
    }
    if (!params.mode) this.restore();
  }

  exit() { this.lifecycle = null; blurCanvasTextInput(); }
  update() {}

  async restore() {
    const lifecycle = this.lifecycle;
    this.busy = true;
    this.message = '正在恢复会话…';
    const restored = await restoreSession();
    if (this.lifecycle !== lifecycle) return;
    if (restored) {
      this.scenes.switch(authenticatedSceneName());
      return;
    }
    this.busy = false;
    this.message = '';
  }

  toggleMode() {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.password = '';
    this.message = '';
    this.syncLabels();
  }

  syncLabels() {
    this.submit.label = this.mode === 'login' ? '登 录' : '注 册';
    this.toggle.label = this.mode === 'login' ? '没有账号？前往注册' : '已有账号？返回登录';
  }

  focus(field) {
    this.active = field;
    const password = field === 'password';
    focusCanvasTextInput(this[field], {
      password,
      maxLength: password ? 128 : 64,
      onInput: (value) => { this[field] = value; },
      onEnter: () => this.submitForm(),
    });
  }

  async submitForm() {
    if (this.busy) return;
    const credentials = validateAccountCredentials(this.username, this.password);
    if (credentials.error) return void (this.message = credentials.error);
    this.busy = true;
    this.message = '连接中…';
    try {
      if (this.mode === 'login') await login(credentials.username, credentials.password);
      else await register(credentials.username, credentials.password);
      blurCanvasTextInput();
      this.scenes.switch(authenticatedSceneName());
    } catch (error) {
      if (error?.status === 429) this.message = '请求过于频繁，请稍后重试';
      else if (error?.status === 503) this.message = '服务暂时不可用，请稍后重试';
      else this.message = error.message || '连接失败，请稍后重试';
    } finally {
      this.busy = false;
    }
  }

  onPointerDown(x, y) {
    if (inside(x, y, 120, 390, 510, 78)) return this.focus('username');
    if (inside(x, y, 120, 520, 510, 78)) return this.focus('password');
    if (this.submit.hitTest(x, y)) return this.submit.onClick();
    if (this.toggle.hitTest(x, y)) return this.toggle.onClick();
  }
  onPointerMove() {}
  onPointerUp() {}

  render(ctx) {
    ctx.fillStyle = '#181209'; ctx.fillRect(0, 0, 750, 1334);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c35a'; ctx.font = 'bold 58px KaiTi, serif';
    ctx.fillText(this.mode === 'login' ? '账号登录' : '创建账号', 375, 230);
    ctx.fillStyle = '#a8895a'; ctx.font = '24px KaiTi, serif';
    ctx.fillText('云端存档与全服军功榜', 375, 285);
    ctx.fillStyle = '#a8895a'; ctx.font = '18px KaiTi, serif';
    ctx.fillText('本站无密码找回功能，请妥善保管密码', 375, 325);
    drawField(ctx, 120, 390, 510, 78, '用户名', this.username, this.active === 'username');
    drawField(ctx, 120, 520, 510, 78, '密码', '•'.repeat(this.password.length), this.active === 'password');
    this.submit.draw(ctx); this.toggle.draw(ctx);
    ctx.fillStyle = this.message.includes('连接中') ? '#e8c35a' : '#e08a78';
    ctx.font = '24px KaiTi, serif'; ctx.fillText(this.message, 375, 930);
  }
}

function drawField(ctx, x, y, w, h, label, value, active) {
  ctx.fillStyle = '#a8895a'; ctx.font = '22px KaiTi, serif'; ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 12);
  ctx.fillStyle = '#241a12'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? '#e8c35a' : '#8a6a42'; ctx.lineWidth = active ? 3 : 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#f0d8a8'; ctx.font = '28px KaiTi, serif'; ctx.fillText(value, x + 18, y + 50);
}

function inside(x, y, left, top, width, height) {
  return x >= left && x <= left + width && y >= top && y <= top + height;
}
