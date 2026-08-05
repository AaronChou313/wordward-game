import { describe, expect, it } from 'vitest';
import { getSave } from '../meta/saveData.js';
import { BattleScene } from './battleScene.js';
import { Effects } from './effects.js';
import { applyBurnEffect, Enemy } from './enemy.js';
import { PATH_TOTAL, pointAt } from './path.js';
import { Score } from './score.js';
import { Tower } from './tower.js';

describe('BattleScene defeat ordering', () => {
  it('stops the frame before a killable Boss mutates score or progression after Lord death', () => {
    const save = getSave();
    save.gold = 0;
    save.bestWave = 0;
    save.merit = { total: 0, claimed: {} };
    save.diff.unlocked = ['easy'];
    save.diff.best = {};
    save.items.owned = {};
    save.shop = { initialized: true, stock: [] };

    const scene = new BattleScene({});
    scene.diff = { id: 'easy', coinMul: 1, dropMul: 0 };
    scene.effects = new Effects();
    scene.score = new Score();
    scene.score.wave = 29;
    scene.score.kills = 5;
    scene.paused = false;
    scene.speed = 1;
    scene.over = false;
    scene.settingsOpen = false;
    scene.campOpen = false;
    scene.elapsed = 0;
    scene.actives = [];
    scene.wave = 30;
    scene.waveState = 'wave';
    scene.spawnQueue = [];
    scene.spawnIndex = 0;
    scene.spawnTimer = 0;
    scene.itemBuffs = { atk: 0, spd: 0, coin: 0 };
    scene.unitGear = {};
    scene.heroGroups = [];
    scene.lordHp = 1;
    scene.lordHpBonus = 0;
    scene.selected = null;
    scene.bar = {
      wave: 0,
      update() {},
      onKill() {},
    };

    const reachingEnemy = new Enemy(100, 0);
    reachingEnemy.dist = PATH_TOTAL;
    Object.assign(reachingEnemy, pointAt(PATH_TOTAL));

    const boss = new Enemy({
      id: 'same-frame-boss',
      type: 'boss',
      name: '同帧 Boss',
      hp: 1,
      speed: 1,
      scale: 1,
      color: '#5a4a6a',
      skill: null,
    });
    const tower = new Tower('弓', 1, 1, 0, 'base');
    scene.enemies = [reachingEnemy, boss];
    scene.towers = [tower];

    scene.update(0.1);

    expect(scene.over).toBe(true);
    expect(scene.lordHp).toBe(0);
    expect(scene.earnedCoins).toBe(295);
    expect(scene.score).toMatchObject({ wave: 29, kills: 5 });
    expect(boss).toMatchObject({ dead: false, hp: 1, dist: 0 });
    expect(boss.bossDefeatHandled).toBeUndefined();
    expect(save.merit).toEqual({ total: 0, claimed: {} });
    expect(save.diff.unlocked).toEqual(['easy']);
    expect(save.shop.stock).toHaveLength(4);
    expect(new Set(save.shop.stock).size).toBe(4);
  });

  it('refreshes shop stock when a battle is settled voluntarily', () => {
    const save = getSave();
    save.gold = 0;
    save.bestWave = 0;
    save.diff.best = {};
    save.items.owned = {};
    save.shop = { initialized: true, stock: [] };

    const scene = new BattleScene({});
    scene.over = false;
    scene.score = new Score();
    scene.diff = { id: 'easy', coinMul: 1 };
    scene.itemBuffs = { coin: 0 };

    scene.gameOver();

    expect(scene.over).toBe(true);
    expect(save.shop.stock).toHaveLength(4);
    expect(new Set(save.shop.stock).size).toBe(4);

    const settledGold = save.gold;
    const settledStock = [...save.shop.stock];
    scene.gameOver();

    expect(save.gold).toBe(settledGold);
    expect(save.shop.stock).toEqual(settledStock);
  });

  it('refreshes shop stock when a Boss wave is cleared (victory round end)', () => {
    const save = getSave();
    save.items.owned = {};
    save.shop = { initialized: true, stock: [] };
    save.merit = { total: 0, claimed: {} };
    save.diff.unlocked = ['easy'];
    save.diff.endlessFloor = 1;
    save.diff.best = {};

    const scene = new BattleScene({});
    scene.diff = { id: 'easy', floor: 1 };
    scene.runId = 'run-refresh';
    scene.runSeed = 'seed-refresh';
    scene.runStartedAt = new Date('2026-08-03T00:00:00.000Z');
    scene.score = { kills: 60 };
    scene.lordHp = 20;

    scene.handleBossDefeated(30);

    expect(save.shop.stock).toHaveLength(4);
    expect(new Set(save.shop.stock).size).toBe(4);
  });

  it('records the actual special enemy spawned by the update loop exactly once', () => {
    const save = getSave();
    save.codex.elite = [];
    save.codex.boss = [];
    save.diff.selected = { id: 'easy' };

    const scene = new BattleScene({});
    scene.enter();
    scene.wave = 9;
    scene.waveState = 'rest';
    scene.restTimer = 0;

    scene.update(0.01);
    const special = scene.spawnQueue.find((descriptor) => descriptor.type === 'elite');
    scene.spawnIndex = scene.spawnQueue.indexOf(special);
    scene.spawnTimer = 0;
    scene.update(0.01);
    scene.update(0.01);

    expect(special).toBeDefined();
    expect(save.codex.elite).toEqual([special.key]);
    expect(save.codex.boss).toEqual([]);
  });

  it('settles a lethal Boss burn through the unified kill path only once', () => {
    const save = getSave();
    save.merit = { total: 0, claimed: {} };
    save.diff.unlocked = ['easy'];
    save.diff.endlessFloor = 1;

    const scene = new BattleScene({});
    scene.diff = { id: 'easy', dropMul: 0 };
    scene.wave = 30;
    scene.score = new Score();
    scene.heroGroups = [];
    scene.effects = new Effects();
    scene.bar = { kills: 0, onKill() { this.kills++; } };
    const source = new Tower('弓', 1, 0, 0, 'base');
    const boss = new Enemy({
      id: 'burn-boss',
      type: 'boss',
      name: '燃烧 Boss',
      hp: 5,
      speed: 1,
      scale: 1,
      color: '#a83d32',
      skill: null,
    });
    applyBurnEffect(boss, source, 1, 10);
    const context = {
      onBurnDamage() {},
      onBurnKill: (enemy, tower) => scene.handleKill(enemy, tower),
    };

    boss.update(1, context);
    boss.update(1, context);

    expect(scene.score.kills).toBe(1);
    expect(scene.bar.kills).toBe(1);
    expect(boss.bossDefeatHandled).toBe(true);
    expect(save.merit).toEqual({ total: 1, claimed: { 'easy:30': true } });
    expect(save.diff.unlocked).toContain('normal');
  });
});
