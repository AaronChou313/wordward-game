export const NORMAL_ENEMY = Object.freeze({
  key: 'raider',
  name: '流寇',
  type: 'normal',
  hpMultiplier: 1,
  speedMultiplier: 1,
  scale: 1,
  color: '#5a4a6a',
  skill: null,
});

export const ELITE_ENEMIES = Object.freeze([
  Object.freeze({
    key: 'quake-captain',
    name: '震地校尉',
    type: 'elite',
    hpMultiplier: 5,
    speedMultiplier: 0.65,
    scale: 1.35,
    color: '#9a6338',
    skill: Object.freeze({
      kind: 'near-stun',
      range: 2.25,
      duration: 2.5,
      cooldown: 8,
      telegraph: 0.8,
    }),
  }),
  Object.freeze({
    key: 'marksman-captain',
    name: '神射都尉',
    type: 'elite',
    hpMultiplier: 5,
    speedMultiplier: 0.65,
    scale: 1.3,
    color: '#527b75',
    skill: Object.freeze({
      kind: 'ranged-stun',
      range: 3,
      duration: 2.25,
      cooldown: 9,
      telegraph: 0.8,
    }),
  }),
]);

export const BOSS_ENEMIES = Object.freeze([
  Object.freeze({
    key: 'hulao-lubu',
    name: '虎牢吕布',
    type: 'boss',
    hpMultiplier: 16,
    speedMultiplier: 0.55,
    scale: 1.7,
    color: '#a83d32',
    skill: Object.freeze({
      kind: 'near-stun',
      range: 3,
      duration: 3,
      cooldown: 7,
      telegraph: 0.8,
    }),
  }),
  Object.freeze({
    key: 'weiwu-caocao',
    name: '魏武曹操',
    type: 'boss',
    hpMultiplier: 16,
    speedMultiplier: 0.55,
    scale: 1.65,
    color: '#574d91',
    skill: Object.freeze({
      kind: 'ranged-stun',
      range: 3,
      duration: 2.75,
      cooldown: 6.5,
      telegraph: 0.8,
    }),
  }),
]);
