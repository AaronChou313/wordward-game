// 合并升阶：同型同阶将士 → 高 1 阶（已入英雄组的字不可合成）
export function canMerge(a, b) {
  if (!a || !b || a === b) return false;
  if (a.kind === 'hero' || b.kind === 'hero') return false;
  if (a.group || b.group) return false;
  return a.char === b.char && a.kind === b.kind && a.tier === b.tier;
}

// 把 src 合并进 dst：dst 升阶，吸收较高等级
export function mergeInto(dst, src) {
  dst.tier++;
  if (src.level > dst.level) {
    dst.level = src.level;
    dst.xp = src.xp;
  }
  dst.cool = 0;
  if (dst.refillBlocker) dst.refillBlocker();
}
