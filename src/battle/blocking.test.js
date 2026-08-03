import { describe, expect, it } from 'vitest';
import { Grid } from './grid.js';
import { Enemy } from './enemy.js';
import { mergeInto } from './merge.js';
import { Tower } from './tower.js';
import { assignBlockers, blockDamage, blockStats } from './blocking.js';

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

describe('road deployment legality', () => {
  it('allows only a base infantry unit on an empty road cell', () => {
    const grid = new Grid();

    expect(grid.canPlace({ char: '兵', kind: 'base' }, 0, 1)).toBe(true);
    expect(grid.canPlace({ char: '骑', kind: 'base' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'adv' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'hero' }, 0, 1)).toBe(false);
    expect(grid.canPlace({ char: '兵', kind: 'group' }, 0, 1)).toBe(false);

    grid.get(0, 1).tower = { char: '兵', kind: 'base' };
    expect(grid.canPlace({ char: '兵', kind: 'base' }, 0, 1)).toBe(false);
  });

  it('allows any unit on an empty active slot and rejects inactive slots', () => {
    const grid = new Grid();

    expect(grid.canPlace({ char: '骑', kind: 'base' }, 1, 0)).toBe(true);
    expect(grid.canPlace({ char: '骑', kind: 'base' }, 0, 0)).toBe(false);
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
  it('assigns highest-progress eligible enemies up to capacity', () => {
    const blocker = roadInfantry(3);
    const enemies = [enemyAt(100), enemyAt(400), enemyAt(250), enemyAt(500)];
    enemies[3].dead = true;

    assignBlockers([blocker], enemies);

    expect(blocker.blockedEnemies).toEqual([enemies[1], enemies[2]]);
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, blocker, blocker, null]);
  });

  it('assigns each enemy once across multiple blockers and leaves overflow moving', () => {
    const first = roadInfantry(3);
    const second = roadInfantry(1, 1, 1);
    const enemies = [enemyAt(100), enemyAt(500), enemyAt(400), enemyAt(300)];

    assignBlockers([first, second], enemies);

    expect(first.blockedEnemies).toEqual([enemies[1], enemies[2]]);
    expect(second.blockedEnemies).toEqual([enemies[3]]);
    expect(new Set(enemies.map((enemy) => enemy.blocker).filter(Boolean)).size).toBe(2);
    const before = enemies[0].dist;
    enemies[0].update(0.5);
    expect(enemies[0].dist).toBeGreaterThan(before);
  });

  it('keeps assignment policy usable with plain state objects', () => {
    const blocker = roadInfantry();
    const enemies = [
      { progress: 0.2, dead: false, reached: false, blocker: null },
      { progress: 0.8, dead: false, reached: false, blocker: null },
    ];

    assignBlockers([blocker], enemies);

    expect(blocker.blockedEnemies).toEqual([enemies[1]]);
    expect(enemies.map((enemy) => enemy.blocker)).toEqual([null, blocker]);
  });
});

describe('blocked enemy attacks', () => {
  it('uses centralized max-HP-scaled damage once per second while movement stays stopped', () => {
    expect(blockDamage({ maxHp: 100 })).toBe(4);
    expect(blockDamage({ maxHp: 250 })).toBe(6);

    const blocker = roadInfantry();
    const enemy = enemyAt(100, 250);
    assignBlockers([blocker], [enemy]);
    const before = enemy.dist;

    enemy.update(0.75);
    expect(enemy.dist).toBe(before);
    expect(blocker.blockHp).toBe(140);
    enemy.update(0.25);
    expect(blocker.blockHp).toBe(134);
  });

  it('releases all assigned enemies immediately when the blocker dies', () => {
    const blocker = roadInfantry();
    const enemies = [enemyAt(300), enemyAt(200)];
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
    const enemies = [enemyAt(300), enemyAt(200)];
    assignBlockers([blocker], enemies);
    blocker.takeBlockDamage(blocker.blockMaxHp);
    const before = enemies[1].dist;

    enemies[1].update(0.1, { holdPosition: true });
    expect(enemies[1].dist).toBe(before);
    enemies[1].update(0.1);
    expect(enemies[1].dist).toBeGreaterThan(before);
  });
});
