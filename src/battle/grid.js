// 棋盘格子：可放置/道路/激活状态、铲子激活
import { COLS, ROWS, CELL, GRID_X, GRID_Y, isPath, INITIAL_ACTIVE, cellCenter } from '../config/map.js';

export class Grid {
  constructor() {
    // cells[r][c] = { kind: 'path'|'slot', active, tower }
    this.cells = [];
    const activeSet = new Set(INITIAL_ACTIVE.map(([c, r]) => c + ',' + r));
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (isPath(c, r)) row.push({ kind: 'path', active: false, tower: null });
        else row.push({ kind: 'slot', active: activeSet.has(c + ',' + r), tower: null });
      }
      this.cells.push(row);
    }
  }

  get(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return this.cells[r][c];
  }

  activate(c, r) {
    const cell = this.get(c, r);
    if (cell && cell.kind === 'slot' && !cell.active) {
      cell.active = true;
      return true;
    }
    return false;
  }

  // 供词组扫描用：返回格上的文字（将士/进阶字）
  charAt(c, r) {
    const cell = this.get(c, r);
    if (!cell || !cell.tower) return null;
    return cell.tower.char;
  }

  render(ctx) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r][c];
        const x = GRID_X + c * CELL;
        const y = GRID_Y + r * CELL;
        if (cell.kind === 'path') {
          ctx.fillStyle = '#3d2f22';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = 'rgba(120, 95, 60, 0.25)';
          ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
        } else if (cell.active) {
          ctx.fillStyle = '#4a3a26';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = '#8a6a42';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        } else {
          ctx.fillStyle = '#241d16';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = '#3a322a';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
          // 未激活标记：锁形交叉线
          ctx.strokeStyle = 'rgba(110, 95, 75, 0.5)';
          ctx.beginPath();
          ctx.moveTo(x + 10, y + 10);
          ctx.lineTo(x + CELL - 10, y + CELL - 10);
          ctx.moveTo(x + CELL - 10, y + 10);
          ctx.lineTo(x + 10, y + CELL - 10);
          ctx.stroke();
        }
      }
    }
  }

  // 绘制主公（路径终点）
  renderLord(ctx, hp, maxHp) {
    const end = cellCenter(6, 9);
    ctx.save();
    ctx.fillStyle = '#7a1f1a';
    ctx.beginPath();
    ctx.arc(end.x, end.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f5d98a';
    ctx.font = 'bold 44px KaiTi, STKaiti, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('主', end.x, end.y + 2);
    // 血条
    ctx.fillStyle = '#333';
    ctx.fillRect(end.x - 40, end.y - 56, 80, 8);
    ctx.fillStyle = '#d84a3a';
    ctx.fillRect(end.x - 40, end.y - 56, 80 * Math.max(0, hp / maxHp), 8);
    ctx.restore();
  }
}
