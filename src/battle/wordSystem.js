// 词组系统：
// - 进阶字 + 基础兵相邻 → 前缀强化（断开失效）
// - 进阶字链式相邻（允许拐弯）拼出人名 → 激活为英雄组，拆散后取消激活
import { PREFIX_BUFFS, HEROES } from '../config/words.js';
import { HeroGroup } from './heroGroup.js';
import { Audio } from '../core/audio.js';

const heroNamesByLen = Object.keys(HEROES).sort((a, b) => b.length - a.length);

// 放置/合并/移动后调用。groups 为 HeroGroup 数组（原地增删）。返回新激活的组（用于提示）
export function rescan(grid, towers, groups, effects) {
  // 1. 重置强化
  for (const t of towers) {
    t.buffs = {};
    t.buffChars = [];
  }

  // 2. 校验已有组：成员仍在格上且仍按顺序相邻成链，否则静默解散（数值保留在成员上）
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!chainValid(grid, towers, groups[i].members)) {
      groups[i].dissolve();
      groups.splice(i, 1);
    }
  }

  // 3. 新词激活（长名优先，每个字只能入一个组）
  const formed = [];
  const used = new Set();
  for (const g of groups) for (const t of g.members) used.add(t);
  for (const name of heroNamesByLen) {
    let chain;
    while ((chain = findChain(grid, name, used))) {
      for (const t of chain) used.add(t);
      const group = new HeroGroup(name, chain);
      groups.push(group);
      formed.push(group);
      if (effects) {
        effects.ring(group.x, group.y, '#ffd75a', 26, 380);
        effects.damageText(group.x, group.y - 60, name + ' 登场!', '#ffd75a', 36);
        effects.shake(5, 0.2);
      }
      Audio.hero();
    }
  }

  // 4. 前缀强化：未入组的进阶字的四邻居是基础兵 → 生效
  for (const t of towers) {
    if (t.kind !== 'adv' || t.group) continue;
    const buff = PREFIX_BUFFS[t.char];
    if (!buff) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cell = grid.get(t.c + dc, t.r + dr);
      if (!cell || !cell.tower) continue;
      const target = cell.tower;
      if (target.kind !== 'base') continue;
      for (const [key, value] of Object.entries(buff.effects)) {
        target.buffs[key] = (target.buffs[key] || 0) + value;
      }
      if (!target.buffChars.includes(t.char)) target.buffChars.push(t.char);
      t.flash = 0.5;
    }
  }

  // 5. 军阵光环：被“军”强化的基础将士把伤害增益传给四邻基础友军。
  for (const source of towers) {
    const aura = source.buffs.adjacentAura || 0;
    if (source.kind !== 'base' || aura <= 0) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = grid.get(source.c + dc, source.r + dr);
      const target = neighbor && neighbor.tower;
      if (!target || target === source || target.kind !== 'base') continue;
      target.buffs.damage = (target.buffs.damage || 0) + aura;
    }
  }

  for (const tower of towers) {
    if (tower.blocking && tower.syncBlockerStats) tower.syncBlockerStats();
  }

  return formed;
}

// 组成员仍在 towers 中、仍占据各自格子、且相邻成员保持 4-邻接
function chainValid(grid, towers, members) {
  for (let i = 0; i < members.length; i++) {
    const t = members[i];
    if (t.kind !== 'adv' || !towers.includes(t)) return false;
    const cell = grid.get(t.c, t.r);
    if (!cell || cell.tower !== t) return false;
    if (i > 0) {
      const p = members[i - 1];
      if (Math.abs(t.c - p.c) + Math.abs(t.r - p.r) !== 1) return false;
    }
  }
  return true;
}

// DFS：从字匹配 name[0] 的未用进阶字出发，沿 4-邻接按顺序拼出整名
function findChain(grid, name, used) {
  for (const t of towersOf(grid)) {
    if (t.kind !== 'adv' || used.has(t) || t.char !== name[0]) continue;
    const chain = extend(grid, name, 0, [t], used);
    if (chain) return chain;
  }
  return null;
}

function extend(grid, name, idx, path, used) {
  if (idx === name.length - 1) return path;
  const cur = path[path.length - 1];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cell = grid.get(cur.c + dc, cur.r + dr);
    if (!cell || !cell.tower) continue;
    const nt = cell.tower;
    if (nt.kind !== 'adv' || used.has(nt) || path.includes(nt)) continue;
    if (nt.char !== name[idx + 1]) continue;
    const found = extend(grid, name, idx + 1, path.concat(nt), used);
    if (found) return found;
  }
  return null;
}

function* towersOf(grid) {
  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell.tower) yield cell.tower;
    }
  }
}
