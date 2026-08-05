import { describe, expect, it } from 'vitest';
import { BattleScene, BATTLE_BAR_LAYOUT } from './battleScene.js';

describe('battle bottom controls', () => {
  it('gives refresh and shovel controls enough height for a label and subtitle', () => {
    expect(BATTLE_BAR_LAYOUT.buttonHeight).toBeGreaterThanOrEqual(64);
    expect(BATTLE_BAR_LAYOUT.buttonY + BATTLE_BAR_LAYOUT.buttonHeight).toBeLessThanOrEqual(1334);

    const scene = new BattleScene({});
    scene.enter();

    expect(scene.btnRefresh.h).toBe(BATTLE_BAR_LAYOUT.buttonHeight);
    expect(scene.btnShovel.h).toBe(BATTLE_BAR_LAYOUT.buttonHeight);
  });
});

