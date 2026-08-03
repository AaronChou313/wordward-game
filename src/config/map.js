// 地图配置：7 列 × 10 行，S 形小路，起点在左上，主公在右下
export const COLS = 7;
export const ROWS = 10;
export const CELL = 96;
export const GRID_X = 39;   // (750 - 7*96) / 2
export const GRID_Y = 210;

// 路径格子（按行进顺序）
export const PATH = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
  [6, 2], [6, 3], [6, 4],
  [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 5], [0, 6], [0, 7],
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
  [6, 8], [6, 9],
];

const pathSet = new Set(PATH.map(([c, r]) => c + ',' + r));
export function isPath(c, r) { return pathSet.has(c + ',' + r); }
export function isSlot(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS && !isPath(c, r); }

// 初始激活的可放置格（6 个，其余靠铲子解锁）
export const INITIAL_ACTIVE = [
  [1, 0], [3, 0], [5, 0],
  [1, 2], [4, 2],
  [2, 3],
];

// 格子中心的设计坐标
export function cellCenter(c, r) {
  return { x: GRID_X + c * CELL + CELL / 2, y: GRID_Y + r * CELL + CELL / 2 };
}

export function pointToCell(x, y) {
  const c = Math.floor((x - GRID_X) / CELL);
  const r = Math.floor((y - GRID_Y) / CELL);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}
