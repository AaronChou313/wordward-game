import { BASE_UNITS } from '../config/units.js';
import { PREFIX_BUFFS, HEROES } from '../config/words.js';
import { ITEMS } from '../config/items.js';
import { BOSS_ENEMIES, ELITE_ENEMIES } from '../config/enemies.js';

const ATTACK_TYPES = {
  single: '远程单体',
  circle: '近身范围',
  line: '直线穿透',
  aoe: '远程范围',
  chain: '全屏连锁',
};

const CAST_MODES = { instant: '点击施放', target: '拖拽指向' };

export function detailFor(category, key) {
  if (category === 'base') return baseDetail(key);
  if (category === 'prefix') return prefixDetail(key);
  if (category === 'hero') return heroDetail(key);
  if (category === 'item') return itemDetail(key);
  if (category === 'elite') return enemyDetail(ELITE_ENEMIES, key, '精英');
  if (category === 'boss') return enemyDetail(BOSS_ENEMIES, key, 'Boss');
  return null;
}

export function isCodexUnlocked(category, key, save) {
  if (category === 'base' || category === 'prefix' || category === 'hero') {
    return Boolean(save.codex && save.codex[category] && save.codex[category].includes(key));
  }
  if (category === 'item') return Boolean(save.items && save.items.owned && save.items.owned[key] > 0);

  if (category === 'elite' || category === 'boss') {
    return Boolean(save.codex && save.codex[category] && save.codex[category].includes(key));
  }
  return false;
}

export function recordCodexEncounter(save, category, key) {
  const collection = category === 'elite' ? ELITE_ENEMIES : category === 'boss' ? BOSS_ENEMIES : null;
  if (!collection || !collection.some((enemy) => enemy.key === key)) return false;
  if (!save.codex) save.codex = {};
  if (!Array.isArray(save.codex[category])) save.codex[category] = [];
  if (save.codex[category].includes(key)) return false;
  save.codex[category].push(key);
  return true;
}

export function detailPresentation(detail, unlocked) {
  if (!detail) return null;
  if (unlocked) return { ...detail, locked: false };
  return {
    title: detail.title,
    rows: [],
    description: '',
    hint: detail.hint,
    locked: true,
  };
}

function baseDetail(key) {
  const unit = BASE_UNITS[key];
  if (!unit) return null;
  return {
    title: `${key}（基础将士）`,
    rows: [
      row('攻击', number(unit.atk)),
      row('攻击间隔', intervalSeconds(unit.interval)),
      row('每秒攻击', (1 / unit.interval).toFixed(2)),
      row('射程', `${number(unit.range)} 格`),
      row('攻击类型', unit.desc),
      row('特殊能力', key === '兵' ? '可部署在道路上阻挡敌军' : attackAbility(unit)),
    ],
    description: `${key}字可直接部署并通过合并升阶，是战斗阵容的基础。`,
    hint: '在战斗中部署该基础文字即可解锁。',
  };
}

function prefixDetail(key) {
  const prefix = PREFIX_BUFFS[key];
  if (!prefix) return null;
  const rows = [row('完整增益', prefix.label)];
  for (const [effect, value] of Object.entries(prefix.effects)) {
    rows.push(prefixEffectRow(effect, value));
  }
  return {
    title: `${key}（增益文字）`,
    rows,
    description: prefix.description,
    hint: prefix.codex.hint,
  };
}

function heroDetail(key) {
  const hero = HEROES[key];
  if (!hero) return null;
  return {
    title: key,
    rows: [
      row('组词', Array.from(key).join(' + ')),
      row('攻击', number(hero.atk)),
      row('攻击间隔', intervalSeconds(hero.interval)),
      row('每秒攻击', (1 / hero.interval).toFixed(2)),
      row('射程', hero.range >= 99 ? '全屏' : `${number(hero.range)} 格`),
      row('攻击类型', ATTACK_TYPES[hero.atkType] || hero.atkType),
      row('英雄技能', hero.desc),
    ],
    description: `将“${Array.from(key).join('”“')}”按顺序四向相邻摆放，可组成英雄 ${key}。`,
    hint: `在战斗中按顺序相邻摆放“${Array.from(key).join('、')}”。`,
  };
}

function itemDetail(key) {
  const item = ITEMS[key];
  if (!item) return null;
  const type = item.kind === 'active'
    ? `主动·${CAST_MODES[item.castMode] || item.castMode}`
    : '被动·持续生效';
  const rows = [
    row('类型', type),
    row('价格', `${item.price} 金`),
    row('Lv1 效果', item.descAt(1)),
  ];
  if (item.kind === 'active') rows.push(row('Lv1 冷却', seconds(item.cooldownAt(1))));
  return {
    title: item.name,
    rows,
    description: item.desc,
    hint: '通过商店或招募获得该道具后解锁完整资料。',
  };
}

function enemyDetail(collection, key, typeLabel) {
  const enemy = collection.find((entry) => entry.key === key);
  if (!enemy) return null;
  const rows = [
    row('类型', typeLabel),
    row('生命倍率', `×${number(enemy.hpMultiplier)}`),
    row('速度倍率', `×${number(enemy.speedMultiplier)}`),
  ];
  if (enemy.skill) {
    rows.push(
      row('技能', enemy.skill.kind === 'near-stun' ? '近身震慑' : '远程压制'),
      row('技能范围', `${number(enemy.skill.range)} 格`),
      row('眩晕时间', seconds(enemy.skill.duration)),
      row('技能冷却', seconds(enemy.skill.cooldown)),
      row('蓄力时间', seconds(enemy.skill.telegraph)),
    );
  }
  return {
    title: enemy.name,
    rows,
    description: enemy.skill
      ? `${enemy.name}会先蓄力，再使符合技能范围条件的将士眩晕。`
      : `${enemy.name}沿道路推进，到达终点会伤害主公。`,
    hint: typeLabel === 'Boss' ? '在第 30 波及其倍数波次遭遇。' : '在第 10、20 波等特殊波次遭遇。',
  };
}

function prefixEffectRow(effect, value) {
  const percent = `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  const effects = {
    atkSpeed: ['攻击速度', percent],
    range: ['射程', percent],
    crit: ['暴击率', percent],
    critMul: ['暴击倍率', `×${number(value)}`],
    damage: ['伤害', percent],
    aoe: ['范围半径', percent],
    slowAura: ['减速幅度', `${Math.round(value * 100)}%`],
    firstHit: ['首击伤害', percent],
    blockerHp: ['阻挡生命', percent],
    blockerCapacity: ['阻挡容量', `+${number(value)}`],
    burnDamage: ['灼烧每秒', `命中伤害的 ${Math.round(value * 100)}%`],
    burnDuration: ['灼烧时间', seconds(value)],
    adjacentAura: ['邻军伤害', percent],
  };
  const [label, display] = effects[effect] || [effect, number(value)];
  return row(label, display);
}

function attackAbility(unit) {
  if (unit.atkType === 'circle') return `命中周围 ${number(unit.aoe)} 格敌军`;
  if (unit.atkType === 'line') return '攻击会贯穿直线上的敌军';
  if (unit.atkType === 'aoe') return `命中点周围 ${number(unit.aoe)} 格敌军`;
  return '优先攻击最接近主公的敌军';
}

function row(label, value) {
  return { label, value: String(value) };
}

function number(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function seconds(value) {
  return `${number(value)} 秒`;
}

function intervalSeconds(value) {
  return `${value.toFixed(2)} 秒`;
}
