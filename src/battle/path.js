// 路径：按配置路点生成折线，支持按行进距离取坐标
import { PATH, cellCenter, CELL } from '../config/map.js';

const points = PATH.map(([c, r]) => cellCenter(c, r));
const segLengths = [];
let totalLength = 0;
for (let i = 0; i < points.length - 1; i++) {
  const dx = points[i + 1].x - points[i].x;
  const dy = points[i + 1].y - points[i].y;
  const len = Math.hypot(dx, dy);
  segLengths.push(len);
  totalLength += len;
}

export const PATH_TOTAL = totalLength;

// dist：已行进像素距离 → { x, y, dirX, dirY, done }
export function pointAt(dist) {
  if (dist >= totalLength) {
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, dirX: 0, dirY: 1, done: true };
  }
  let d = dist;
  for (let i = 0; i < segLengths.length; i++) {
    if (d <= segLengths[i]) {
      const t = d / segLengths[i];
      const a = points[i], b = points[i + 1];
      const dirX = (b.x - a.x) / segLengths[i];
      const dirY = (b.y - a.y) / segLengths[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dirX, dirY, done: false };
    }
    d -= segLengths[i];
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, dirX: 0, dirY: 1, done: true };
}

export function speedPx(cellsPerSec) {
  return cellsPerSec * CELL;
}
