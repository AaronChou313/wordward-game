import { describe, expect, it } from 'vitest';
import { CELL } from '../config/map.js';
import { advanceSkillTimer, selectStunTargets } from './enemy.js';
import { spawnPlan } from './spawnPlan.js';
import { advanceStunTimers, Tower } from './tower.js';

const WAVE_CFG = {
  count: 3,
  hp: 100,
  speed: 2,
  spawnInterval: 0.5,
};

describe('spawnPlan', () => {
  it('keeps a normal-only wave at the configured enemy count', () => {
    const plan = spawnPlan(1, WAVE_CFG, () => 0);

    expect(plan).toHaveLength(3);
    expect(plan.map((enemy) => enemy.type)).toEqual(['normal', 'normal', 'normal']);
    expect(plan.map((enemy) => enemy.id)).toEqual([
      'wave-1-normal-1',
      'wave-1-normal-2',
      'wave-1-normal-3',
    ]);
  });

  it.each([10, 20, 40, 50])('adds one elite after all normal enemies on wave %i', (wave) => {
    const plan = spawnPlan(wave, WAVE_CFG, () => 0);

    expect(plan).toHaveLength(4);
    expect(plan.slice(0, 3).every((enemy) => enemy.type === 'normal')).toBe(true);
    expect(plan[3]).toMatchObject({
      type: 'elite',
      hp: 500,
      speed: 1.3,
      hpMultiplier: 5,
      speedMultiplier: 0.65,
    });
  });

  it.each([30, 60])('adds one Boss after all normal enemies on wave %i', (wave) => {
    const plan = spawnPlan(wave, WAVE_CFG, () => 0);

    expect(plan).toHaveLength(4);
    expect(plan.slice(0, 3).every((enemy) => enemy.type === 'normal')).toBe(true);
    expect(plan[3]).toMatchObject({
      type: 'boss',
      hp: 1600,
      speed: 1.1,
      hpMultiplier: 16,
      speedMultiplier: 0.55,
    });
  });

  it('selects named archetypes deterministically from the wave and injected random value', () => {
    const elite10 = spawnPlan(10, WAVE_CFG, () => 0.25).at(-1);
    const elite20 = spawnPlan(20, WAVE_CFG, () => 0.25).at(-1);
    const boss30 = spawnPlan(30, WAVE_CFG, () => 0.25).at(-1);
    const boss60 = spawnPlan(60, WAVE_CFG, () => 0.25).at(-1);

    expect([elite10.name, elite20.name].sort()).toEqual(['神射都尉', '震地校尉']);
    expect([boss30.name, boss60.name].sort()).toEqual(['虎牢吕布', '魏武曹操']);
    expect(spawnPlan(10, WAVE_CFG, () => 0.25).at(-1)).toEqual(elite10);
  });

  it('puts stable identity, visuals, and complete skill data on a special descriptor', () => {
    const special = spawnPlan(10, WAVE_CFG, () => 0).at(-1);

    expect(special.id).toBe('wave-10-elite-marksman-captain');
    expect(special).toMatchObject({
      name: '神射都尉',
      type: 'elite',
      scale: expect.any(Number),
      color: expect.stringMatching(/^#/),
      skill: {
        kind: 'ranged-stun',
        range: 3,
        duration: expect.any(Number),
        cooldown: expect.any(Number),
        telegraph: 0.8,
      },
    });
    expect(special.skill.duration).toBeGreaterThanOrEqual(2);
    expect(special.skill.duration).toBeLessThanOrEqual(3);
  });
});

describe('special enemy control', () => {
  it('selects only living towers inside a near-stun radius', () => {
    const towers = [
      { x: 0, y: 0, dead: false },
      { x: 2 * CELL, y: 0, dead: false },
      { x: 2 * CELL + 1, y: 0, dead: false },
      { x: 0, y: 0, dead: true },
    ];

    expect(selectStunTargets(
      { x: 0, y: 0 },
      towers,
      { kind: 'near-stun', range: 2 },
    )).toEqual(towers.slice(0, 2));
  });

  it('selects only living towers with at least the ranged skill threshold', () => {
    const towers = [
      { dead: false, effectiveRange: 2.9 },
      { dead: false, effectiveRange: 3 },
      { dead: false, effectiveRange: 4.2 },
      { dead: true, effectiveRange: 5 },
    ];

    expect(selectStunTargets(
      { x: 0, y: 0 },
      towers,
      { kind: 'ranged-stun', range: 3 },
      (tower) => tower.effectiveRange,
    )).toEqual(towers.slice(1, 3));
  });

  it('telegraphs for 0.8 seconds before firing and resetting cooldown', () => {
    const skill = { telegraph: 0.8, cooldown: 7 };
    let state = advanceSkillTimer({ cooldown: 0, telegraph: 0 }, skill, 0.1);

    expect(state).toEqual({ cooldown: 0, telegraph: 0.8, fired: false });
    state = advanceSkillTimer(state, skill, 0.79);
    expect(state.fired).toBe(false);
    expect(state.telegraph).toBeCloseTo(0.01);
    state = advanceSkillTimer(state, skill, 0.01);
    expect(state).toEqual({ cooldown: 7, telegraph: 0, fired: true });
  });

  it('starts two seconds of immunity when a stun ends', () => {
    const ended = advanceStunTimers({ stunTimer: 0.1, stunImmuneTimer: 0 }, 0.1);
    const immune = advanceStunTimers(ended, 0.5);

    expect(ended).toEqual({ stunTimer: 0, stunImmuneTimer: 2, stunned: true });
    expect(immune).toEqual({ stunTimer: 0, stunImmuneTimer: 1.5, stunned: false });
  });

  it('does not reset or extend an active stun or immunity window', () => {
    const tower = new Tower('兵', 1, 1, 0, 'base');

    expect(tower.applyStun(2.5)).toBe(true);
    expect(tower.applyStun(3)).toBe(false);
    expect(tower.stunTimer).toBe(2.5);

    tower.stunTimer = 0;
    tower.stunImmuneTimer = 1.25;
    expect(tower.applyStun(3)).toBe(false);
    expect(tower.stunImmuneTimer).toBe(1.25);
  });
});
