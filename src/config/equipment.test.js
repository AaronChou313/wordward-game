import { describe, expect, it } from 'vitest';
import { EQUIP, bondStats } from './equipment.js';

describe('equipment series bonds', () => {
  it('returns nothing when fewer than two of a series are equipped', () => {
    expect(bondStats({ '武器': 'u1' }, [{ uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] }])).toEqual({});
  });

  it('applies the 2-piece bond for a series', () => {
    const owned = [
      { uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_armor', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2' }, owned)).toEqual({ atk: 0.08 });
  });

  it('applies the 3-piece full bond for a series', () => {
    const owned = [
      { uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_armor', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u3', id: 'p_charm', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2', '饰品': 'u3' }, owned)).toMatchObject({ atk: 0.15, spd: 0.08 });
  });

  it('applies the 龙腾 lordHp/blockerHp bond when all three are equipped', () => {
    const owned = [
      { uid: 'u1', id: 'p_dragonWeapon', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_dragonArmor', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u3', id: 'p_dragonTrinket', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2', '饰品': 'u3' }, owned)).toMatchObject({ lordHp: 4, blockerHp: 0.20 });
  });

  it('applies the 凤仪 coin/stunDuration bond when all three are equipped', () => {
    const owned = [
      { uid: 'u1', id: 'p_phoenixWeapon', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_phoenixArmor', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u3', id: 'p_phoenixTrinket', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2', '饰品': 'u3' }, owned)).toMatchObject({ coin: 0.25, stunDuration: 0.30 });
  });
});
