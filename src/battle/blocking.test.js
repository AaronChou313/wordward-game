import { describe, expect, it } from 'vitest';
import { Grid } from './grid.js';
import { Enemy } from './enemy.js';
import { mergeInto } from './merge.js';
import { Tower } from './tower.js';
import { assignBlockers, blockDamage, blockStats } from './blocking.js';
import { BattleScene } from './battleScene.js';
import { Effects } from './effects.js';
import { CELL, cellCenter } from '../config/map.js';
import { PATH_TOTAL } from './path.js';

function roadInfantry(tier = 1, c = 0, r = 1) {
  const tower = new Tower('兵', tier, c, r, 'base');
  tower.deployAsBlocker();
  return tower;
}

function enemyAt(progress, maxHp = 100) {
  const enemy = new Enemy(maxHp, 1);
  enemy.dist = progress;
  return enemy;
}

function minimalScene() {
  const scene = new BattleScene({});
  scene.grid = new Grid();
  scene.towers = [];
  scene.heroGroups = [];
  scene.enemies = [];
  scene.effects = new Effects();
  scene.selected = null;
  scene.settingsOpen = false;
  scene.campOpen = false;
  scene.pointer = { x: 0, y: 0 };
  scene.bar = {
    slots: Array(5).fill(null),
    take(index) {
      const item = this.slots[index];
      this.slots[index] = null;
      return item;
    },
  };
  return scene;
}

describe('road deployment legality', () => {
  it('allows only a base infantry unit on an empty road cell', () => {
    const grid = new Grid();

    expect(grid.canPlace({ char: '兵', kind: 'base' }, 0, 1)).toBe(true);
    expect(grid.canPlace({ char: '骑', kind: 'base' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'adv' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'hero' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'group' }, 0, 1)).toBe(false);

    const groupedInfantry = new Tower('兵', 1, 1, 0, 'base');
    groupedInfantry.group = { name: '测试英雄组' };
    expect(grid.canPlace(groupedInfantry, 0, 1)).toBe(false);

    grid.get(0, 1).tower = { char: '兵', kind: 'base' };
    expect(grid.canPlace({ char: '兵', kind: 'base' }, 0, 1)).toBe(false);
  });

  it('allows any unit on an empty active slot and rejects inactive slots', () => {
    const grid = new Grid();

    expect(grid.canPlace({ char: '骑', kind: 'base' }, 1, 0)).toBe(true);
    expect(grid.canPlace({ char: '骑', kind: 'base' }, 0, 0)).toBe(false);
  });
});

describe('BattleScene blocker ownership integration', () => {
  it('leaves bar, grid, and tower collection unchanged for an invalid road drop', () => {
    const scene = minimalScene();
    const item = { char: '骑', kind: 'base', tier: 1, level: 1, xp: 0 };
    const road = scene.grid.get(0, 1);
    scene.bar.slots[0] = item;
    scene.drag = {
      source: 'slot', index: 0, char: item.char, kind: item.kind,
      moved: true, x: 0, y: 0, downX: 0, downY: 0,
    };
    const destination = cellCenter(0, 1);

    scene.onPointerUp(destination.x, destination.y);

    expect(scene.bar.slots[0]).toBe(item);
    expect(road.tower).toBe(null);
    expect(scene.towers).toEqual([]);
  });

  it('moves and swaps road infantry with exact grid and collection ownership', () => {
    const scene = minimalScene();
    const firstRoad = scene.grid.get(0, 1);
    const secondRoad = scene.grid.get(1, 1);
    const active = scene.grid.get(1, 0);
    const source = roadInfantry(1, 0, 1);
    const destination = new Tower('兵', 2, 1, 0, 'base');
    firstRoad.tower = source;
    active.tower = destination;
    scene.towers.push(source, destination);

    scene.drag = { source: 'tower', tower: source, moved: true };
    let point = cellCenter(1, 1);
    scene.onPointerUp(point.x, point.y);

    expect(firstRoad.tower).toBe(null);
    expect(secondRoad.tower).toBe(source);
    expect(source.blocking).toBe(true);
    expect(scene.towers).toEqual([source, destination]);

    scene.drag = { source: 'tower', tower: source, moved: true };
    point = cellCenter(1, 0);
    scene.onPointerUp(point.x, point.y);

    expect(secondRoad.tower).toBe(destination);
    expect(active.tower).toBe(source);
    expect(source.blocking).toBe(false);
    expect(destination.blocking).toBe(true);
    expect([source.c, source.r]).toEqual([1, 0]);
    expect([destination.c, destination.r]).toEqual([1, 1]);
    expect(scene.towers).toEqual([source, destination]);
  });

  it('removes a lethally attacked blocker and releases its enemy for the next update', () => {
    const scene = minimalScene();
    const blocker = roadInfantry();
    const enemy = enemyAt(10, 10000);
    scene.grid.get(0, 1).tower = blocker;
    scene.towers.push(blocker);
    scene.enemies.push(enemy);
    scene.over = false;
    scene.paused = false;
    scene.speed = 1;
    scene.elapsed = 0;
    scene.actives = [];
    scene.wave = 1;
    scene.waveState = 'wave';
    scene.spawnQueue = [];
    scene.spawnIndex = 0;
    scene.score = { wave: 0 };
    scene.itemBuffs = { atk: 0, spd: 0 };
    scene.unitGear = {};
    scene.bar.update = () => {};

    const blockedAt = enemy.dist;
    scene.update(1);

    expect(scene.grid.get(0, 1).tower).toBe(null);
    expect(scene.towers).toEqual([]);
    expect(enemy.blocker).toBe(null);
    expect(enemy.dist).toBe(blockedAt);

    scene.update(0.1);
    expect(enemy.dist).toBeGreaterThan(blockedAt);
  });
});

describe('blocker stats', () => {
  it.each([
    [1, 1, { maxHp: 140, capacity: 1 }],
    [2, 1, { maxHp: 238, capacity: 1 }],
    [3, 4, { maxHp: 550, capacity: 2 }],
    [7, 2, { maxHp: 3785, capacity: 4 }],
  ])('calculates exact tier %i level %i stats', (tier, level, expected) => {
    expect(blockStats(tier, level)).toEqual(expected);
  });

  it('refills road infantry after a level-up and a merge', () => {
    const leveling = roadInfantry();
    leveling.takeBlockDamage(80);
    expect(leveling.gainXp(10)).toBe(true);
    expect(leveling.blockMaxHp).toBe(157);
    expect(leveling.blockHp).toBe(157);

    const merging = roadInfantry(2);
    merging.takeBlockDamage(100);
    mergeInto(merging, new Tower('兵', 2, 1, 0, 'base'));
    expect(merging.tier).toBe(3);
    expect(merging.blockMaxHp).toBe(405);
    expect(merging.blockHp).toBe(405);
    expect(merging.blockCapacity).toBe(2);
  });
});

describe('blocker assignments', () => {
  it('does not let an exit-side blocker stop enemies near the entrance', () => {
    const blocker = roadInfantry(1, 6, 8);
    const enemy = enemyAt(CELL);

    assignBlockers([blocker], [enemy]);

    expect(blocker.blockedEnemies).toEqual([]);
    expect(enemy.blocker).toBe(null);
  });

  it('stops an enemy once it reaches the blocker road cell', () => {
    const blocker = roadInfantry(1, 3, 1);
    const enemy = enemyAt(3 * CELL - 1);

    assignBlockers([blocker], [enemy]);
    expect(enemy.blocker).toBe(null);

    enemy.dist = 3 * CELL;
    assignBlockers([blocker], [enemy]);
    const blockedAt = enemy.dist;
    enemy.update(0.5);

    expect(enemy.blocker).toBe(blocker);
    expect(enemy.dist).toBe(blockedAt);
  });

  it('assigns only enemies in the blocker interception window up to capacity', () => {
    const blocker = roadInfantry(3);
    const enemies = [enemyAt(2 * CELL), enemyAt(20), enemyAt(10), enemyAt(5)];
    enemies[3].dead = true;

    assignBlockers([blocker], enemies);

    expect(blocker.blockedEnemies).toEqual([enemies[1], enemies[2]]);
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, blocker, blocker, null]);
  });

  it('lets multiple blockers own local path segments and leaves overflow moving', () => {
    const first = roadInfantry(3, 2, 1);
    const second = roadInfantry(1, 3, 4);
    const enemies = [
      enemyAt(CELL),
      enemyAt(2 * CELL + 30),
      enemyAt(12 * CELL + 20),
      enemyAt(2 * CELL + 20),
      enemyAt(2 * CELL + 10),
    ];

    assignBlockers([second, first], enemies);

    expect(first.blockedEnemies).toEqual([enemies[1], enemies[3]]);
    expect(second.blockedEnemies).toEqual([enemies[2]]);
    const assigned = first.blockedEnemies.concat(second.blockedEnemies);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(new Set(enemies.map((enemy) => enemy.blocker).filter(Boolean)).size).toBe(2);
    const before = enemies[4].dist;
    enemies[4].update(0.5);
    expect(enemies[4].dist).toBeGreaterThan(before);
  });

  it('preserves a valid local assignment when another enemy enters capacity', () => {
    const blocker = roadInfantry();
    const first = enemyAt(20);
    const second = enemyAt(10);

    assignBlockers([blocker], [first, second]);
    second.dist = 30;
    assignBlockers([blocker], [second, first]);

    expect(blocker.blockedEnemies).toEqual([first]);
    expect(first.blocker).toBe(blocker);
    expect(second.blocker).toBe(null);
  });

  it('keeps assignment policy usable with plain state objects', () => {
    const blocker = roadInfantry();
    const enemies = [
      { progress: 10 / PATH_TOTAL, dead: false, reached: false, blocker: null },
      { progress: 20 / PATH_TOTAL, dead: false, reached: false, blocker: null },
    ];

    assignBlockers([blocker], enemies);

    expect(blocker.blockedEnemies).toEqual([enemies[1]]);
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, blocker]);

    blocker.releaseBlockedEnemies();
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, null]);
  });
});

describe('blocked enemy attacks', () => {
  it('uses centralized max-HP-scaled damage once per second while movement stays stopped', () => {
    expect(blockDamage({ maxHp: 100 })).toBe(4);
    expect(blockDamage({ maxHp: 250 })).toBe(6);

    const blocker = roadInfantry();
    const enemy = enemyAt(10, 250);
    assignBlockers([blocker], [enemy]);
    const before = enemy.dist;

    enemy.update(0.75);
    expect(enemy.dist).toBe(before);
    expect(blocker.blockHp).toBe(140);
    enemy.update(0.25);
    expect(blocker.blockHp).toBe(134);
  });

  it('releases all assigned enemies immediately when the blocker dies', () => {
    const blocker = roadInfantry(3);
    const enemies = [enemyAt(20), enemyAt(10)];
    assignBlockers([blocker], enemies);

    expect(blocker.takeBlockDamage(blocker.blockMaxHp)).toBe(true);
    expect(blocker.dead).toBe(true);
    expect(blocker.blockedEnemies).toEqual([]);
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, null]);

    const before = enemies[0].dist;
    enemies[0].update(0.1);
    expect(enemies[0].dist).toBeGreaterThan(before);
  });

  it('holds enemies released mid-frame until the following frame', () => {
    const blocker = roadInfantry();
    const enemies = [enemyAt(20), enemyAt(10)];
    assignBlockers([blocker], enemies);
    blocker.takeBlockDamage(blocker.blockMaxHp);
    const before = enemies[1].dist;

    enemies[1].update(0.1, { holdPosition: true });
    expect(enemies[1].dist).toBe(before);
    enemies[1].update(0.1);
    expect(enemies[1].dist).toBeGreaterThan(before);
  });
});
