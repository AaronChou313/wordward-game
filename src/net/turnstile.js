// Browser-only Turnstile adapter. The secret key is never read by this module.
const WIDGET_ID = '__wordward_turnstile_widget__';

export class TurnstileUnavailableError extends Error {
  constructor(message = '安全验证暂不可用，请稍后重试') {
    super(message);
    this.name = 'TurnstileUnavailableError';
  }
}

function siteKey() {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="turnstile-site-key"]')?.content?.trim() || '';
}

/** Resolve a fresh short-lived token. No configured site key is allowed in local/offline builds. */
export async function getTurnstileToken(action = 'login') {
  const key = siteKey();
  if (!key) return '';
  const turnstile = globalThis.turnstile;
  if (!turnstile || typeof turnstile.render !== 'function' || typeof turnstile.execute !== 'function') {
    throw new TurnstileUnavailableError();
  }
  let container = document.getElementById(WIDGET_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = WIDGET_ID;
    container.hidden = true;
    document.body.appendChild(container);
  }
  let widgetId = container.dataset.widgetId;
  if (!widgetId) {
    widgetId = turnstile.render(container, { sitekey: key, size: 'invisible', action });
    container.dataset.widgetId = String(widgetId);
  }
  try {
    const token = await new Promise((resolve, reject) => {
      turnstile.execute(widgetId, { action, callback: resolve, 'error-callback': reject, 'expired-callback': reject });
    });
    if (!token) throw new TurnstileUnavailableError();
    return token;
  } catch {
    throw new TurnstileUnavailableError();
  } finally {
    try { turnstile.reset(widgetId); } catch { /* widget may have been removed */ }
  }
}
