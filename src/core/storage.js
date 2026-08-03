// localStorage 封装，带版本号便于后续迁移
const PREFIX = 'sgtd_';

export function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function saveData(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // 存储满等异常静默失败，不影响游戏进行
  }
}
