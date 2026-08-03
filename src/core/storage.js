// localStorage 封装，带版本号便于后续迁移
const PREFIX = 'sgtd_';
const saveListeners = new Set();

export function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function saveData(key, value, options = {}) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (options.notify !== false) {
      for (const listener of saveListeners) {
        try { listener(key, value); } catch (e) { /* 同步监听器不得中断本地存档 */ }
      }
    }
  } catch (e) {
    // 存储满等异常静默失败，不影响游戏进行
  }
}

export function subscribeDataSaves(listener) {
  saveListeners.add(listener);
  return () => saveListeners.delete(listener);
}
