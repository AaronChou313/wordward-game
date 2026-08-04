import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountScene, accountErrorMessage, validateAccountCredentials } from './accountScene.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account credential validation', () => {
  it('allows a one-character password', () => {
    expect(validateAccountCredentials('alice', 'x')).toEqual({
      username: 'alice',
      password: 'x',
      error: '',
    });
  });

  it('rejects empty and overlong passwords', () => {
    expect(validateAccountCredentials('alice', '').error).toBe('密码需为 1–128 个字符');
    expect(validateAccountCredentials('alice', 'x'.repeat(129)).error).toBe('密码需为 1–128 个字符');
  });

  it('clears and blurs the native password input when switching modes', () => {
    const input = {
      style: {}, value: '', focus: vi.fn(), blur: vi.fn(), removeAttribute: vi.fn(), setSelectionRange: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => input), body: { appendChild: vi.fn() } });
    vi.stubGlobal('window', { scrollX: 0, scrollY: 0, scrollTo: vi.fn() });
    const scene = new AccountScene({ switch: vi.fn() });
    scene.focus('password');
    input.value = 'old-password';
    input.oninput();

    scene.toggleMode();

    expect(scene.mode).toBe('register');
    expect(scene.password).toBe('');
    expect(scene.active).toBeNull();
    expect(input.value).toBe('');
    expect(input.blur).toHaveBeenCalledOnce();
  });

  it('maps origin and Turnstile failures to actionable Chinese messages', () => {
    expect(accountErrorMessage({ status: 403, data: { code: 'ORIGIN_MISMATCH' } })).toBe('当前访问地址不受支持，请使用本站正式域名访问');
    expect(accountErrorMessage({ status: 403, data: { code: 'TURNSTILE_FAILED' } })).toBe('安全验证失败，请刷新页面后重试');
  });
});
