import { BOSS_ENEMIES, ELITE_ENEMIES, NORMAL_ENEMY } from '../config/enemies.js';

export function spawnPlan(wave, waveCfg, random = Math.random) {
  const count = Math.max(0, Math.floor(waveCfg.count));
  const plan = [];

  for (let i = 0; i < count; i++) {
    plan.push(descriptorFor(wave, NORMAL_ENEMY, waveCfg, i + 1));
  }

  const special = specialFor(wave, random);
  if (special) plan.push(descriptorFor(wave, special, waveCfg));
  return plan;
}

function specialFor(wave, random) {
  if (!Number.isInteger(wave) || wave <= 0) return null;
  if (wave % 30 === 0) {
    return select(BOSS_ENEMIES, Math.floor(wave / 30), random);
  }
  const cycleWave = wave % 30;
  if (cycleWave === 10 || cycleWave === 20) {
    return select(ELITE_ENEMIES, Math.floor(wave / 10), random);
  }
  return null;
}

function select(archetypes, waveSeed, random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const randomOffset = Math.floor(roll * archetypes.length);
  return archetypes[(waveSeed + randomOffset) % archetypes.length];
}

function descriptorFor(wave, archetype, waveCfg, normalIndex) {
  const id = archetype.type === 'normal'
    ? 'wave-' + wave + '-normal-' + normalIndex
    : 'wave-' + wave + '-' + archetype.type + '-' + archetype.key;
  return {
    id,
    type: archetype.type,
    name: archetype.name,
    hp: Math.round(waveCfg.hp * archetype.hpMultiplier),
    speed: waveCfg.speed * archetype.speedMultiplier,
    hpMultiplier: archetype.hpMultiplier,
    speedMultiplier: archetype.speedMultiplier,
    scale: archetype.scale,
    color: archetype.color,
    skill: archetype.skill,
  };
}
