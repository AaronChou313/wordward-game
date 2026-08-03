import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../config/difficulty.js';
import { CELL } from '../config/map.js';
import { waveConfig } from '../config/waves.js';
import { getSave } from '../meta/saveData.js';
import { BattleScene } from './battleScene.js';
import { advanceSkillTimer, Enemy, selectStunTargets } from './enemy.js';
import { spawnPlan } from './spawnPlan.js';
import { advanceStunTimers, Tower } from './tower.js';

function difficulty(id) {
  return DIFFICULTIES.find((entry) => entry.id === id);
}

function composition(plan) {
  return plan.reduce((counts, enemy) => {
    counts[enemy.type]++;
    return counts;
  }, { normal: 0, elite: 0, boss: 0 });
}

function simulateBossControl(seconds, step) {
  const bossDescriptor = spawnPlan(
    60,
    waveConfig(60, difficulty('easy')),
    () => 0.25,
  ).at(-1);
  const boss = new Enemy(bossDescriptor);
  boss.x = 0;
  boss.y = 0;

  const towers = ['兵', '骑', '枪', '弓', '炮', '兵'].map((char, index) => {
    const tower = new Tower(char, 1, index, 0, 'base');
    tower.x = (index + 1) * CELL;
    tower.y = 0;
    return tower;
  });
  const disabledTime = towers.map(() => 0);
  const immunityObserved = towers.map(() => false);
  let fireCount = 0;
  let targetCount = 0;

  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    const skillState = advanceSkillTimer({
      cooldown: boss.skillCooldown,
      telegraph: boss.skillTelegraphTimer,
    }, boss.skill, step);
    boss.skillCooldown = skillState.cooldown;
    boss.skillTelegraphTimer = skillState.telegraph;

    if (skillState.fired) {
      fireCount++;
      const targets = selectStunTargets(boss, towers, boss.skill);
      targetCount = targets.length;
      for (const tower of targets) tower.applyStun(boss.skill.duration);
    }

    towers.forEach((tower, index) => {
      const stunState = advanceStunTimers(tower, step);
      tower.stunTimer = stunState.stunTimer;
      tower.stunImmuneTimer = stunState.stunImmuneTimer;
      if (stunState.stunned) disabledTime[index] += step;
      if (tower.stunImmuneTimer > 0) immunityObserved[index] = true;
    });
  }

  const cycle = boss.skill.cooldown + boss.skill.telegraph;
  const theoreticalRatio = (
    Math.floor(seconds / cycle) * targetCount * boss.skill.duration
  ) / (seconds * towers.length);
  const observedRatio = disabledTime.reduce((sum, time) => sum + time, 0)
    / (seconds * towers.length);

  return {
    bossDescriptor,
    fireCount,
    targetCount,
    theoreticalRatio,
    observedRatio,
    immunityObserved,
  };
}

describe('integrated special-wave balance', () => {
  it.each([
    ['easy', 10, { normal: 26, elite: 1, boss: 0 }, '神射都尉'],
    ['easy', 20, { normal: 46, elite: 1, boss: 0 }, '震地校尉'],
    ['easy', 30, { normal: 66, elite: 0, boss: 1 }, '魏武曹操'],
    ['easy', 60, { normal: 126, elite: 0, boss: 1 }, '虎牢吕布'],
    ['hard', 10, { normal: 40, elite: 1, boss: 0 }, '神射都尉'],
    ['hard', 20, { normal: 70, elite: 1, boss: 0 }, '震地校尉'],
    ['hard', 30, { normal: 100, elite: 0, boss: 1 }, '魏武曹操'],
    ['hard', 60, { normal: 190, elite: 0, boss: 1 }, '虎牢吕布'],
  ])('builds the literal %s wave-%i composition', (diffId, wave, expected, specialName) => {
    const plan = spawnPlan(wave, waveConfig(wave, difficulty(diffId)), () => 0.25);

    expect(composition(plan)).toEqual(expected);
    expect(plan.at(-1).name).toBe(specialName);
  });

  it.each(['easy', 'hard'])('keeps the %s wave-30 Boss at the 16x HP target', (diffId) => {
    const plan = spawnPlan(30, waveConfig(30, difficulty(diffId)), () => 0.25);
    const normal = plan.find((enemy) => enemy.type === 'normal');
    const boss = plan.find((enemy) => enemy.type === 'boss');
    const ratio = boss.hp / normal.hp;

    expect(ratio).toBeGreaterThanOrEqual(12);
    expect(ratio).toBeLessThanOrEqual(20);
    expect(ratio).toBe(16);
  });

  it('keeps a six-tower formation below 25% disabled time over 60 seconds', () => {
    const result = simulateBossControl(60, 0.1);

    expect(result.bossDescriptor).toMatchObject({
      name: '虎牢吕布',
      skill: { cooldown: 7, telegraph: 0.8, duration: 3 },
    });
    expect(result.fireCount).toBe(7);
    expect(result.targetCount).toBe(3);
    expect(result.immunityObserved.filter(Boolean)).toHaveLength(3);
    expect(result.theoreticalRatio).toBeCloseTo(0.175, 6);
    expect(result.theoreticalRatio).toBeLessThan(0.25);
    expect(result.observedRatio).toBeLessThan(0.25);
  });
});

describe('Boss descriptor progression integration', () => {
  it('claims once, unlocks the next difficulty, and leaves combat running', () => {
    const save = getSave();
    save.merit = { total: 0, claimed: {} };
    save.diff.unlocked = ['easy'];

    const scene = new BattleScene({});
    scene.diff = { id: 'easy', dropMul: 0 };
    scene.wave = 30;
    scene.score = { kills: 0 };
    scene.bar = { onKill() {} };
    scene.heroGroups = [];
    scene.over = false;
    scene.paused = false;

    const descriptor = spawnPlan(
      scene.wave,
      waveConfig(scene.wave, difficulty('easy')),
      () => 0.25,
    ).at(-1);
    const boss = new Enemy(descriptor);

    expect(boss.type).toBe('boss');
    expect(boss.takeDamage(boss.maxHp)).toBe(true);
    scene.handleKill(boss, null);
    scene.handleKill(boss, null);

    expect(boss.bossDefeatHandled).toBe(true);
    expect(save.merit).toEqual({ total: 1, claimed: { 'easy:30': true } });
    expect(save.diff.unlocked).toEqual(['easy', 'normal']);
    expect(scene.over).toBe(false);
    expect(scene.paused).toBe(false);
  });

  it('uses the selected endless floor when claiming a wave-30 Boss', () => {
    const save = getSave();
    save.merit = { total: 0, claimed: {} };
    save.diff.unlocked = ['easy', 'normal', 'hard', 'endless'];
    save.diff.endlessFloor = 2;

    const scene = new BattleScene({});
    scene.diff = { id: 'endless', floor: 2, dropMul: 0 };

    const result = scene.handleBossDefeated(30);

    expect(result).toEqual({
      claimed: true,
      merit: 8,
      unlocked: null,
      unlockedFloor: 3,
    });
    expect(save.merit).toEqual({ total: 8, claimed: { 'endless:2:30': true } });
    expect(save.diff.endlessFloor).toBe(3);
  });
});
