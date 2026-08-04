import { describe, expect, it, vi } from 'vitest';
import { BattleScene } from './battleScene.js';
import { Effects } from './effects.js';

const noHit = { hitTest: () => false, onClick: () => {} };

function sceneWithSlots(slots) {
  const scene = new BattleScene({});
  scene.effects = new Effects();
  scene.selected = null;
  scene.settingsOpen = false;
  scene.campOpen = false;
  scene.volumeDragging = false;
  scene.pointer = { x: 0, y: 0 };
  scene.actives = [];
  scene.bar = { slots, shovels: 0 };
  scene.btnSpeed = noHit;
  scene.btnPause = noHit;
  scene.btnCamp = noHit;
  scene.btnGear = noHit;
  scene.btnRefresh = noHit;
  scene.btnShovel = noHit;
  scene.btnResume = noHit;
  scene.btnExit = noHit;
  scene.btnCloseCamp = noHit;
  return scene;
}

function dragSlot(scene, from, to) {
  const fromX = 39 + from * 128 + 60;
  const toX = 39 + to * 128 + 60;
  scene.onPointerDown(fromX, 1224);
  scene.onPointerMove(toX, 1224);
  scene.onPointerUp(toX, 1224);
}

describe('battle bar merges', () => {
  it('merges matching same-tier units directly inside the bar', () => {
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0);
    const scene = sceneWithSlots([
      { char: '兵', kind: 'base', tier: 1, level: 3, xp: 4 },
      { char: '兵', kind: 'base', tier: 1, level: 2, xp: 1 },
      null, null, null,
    ]);

    dragSlot(scene, 0, 1);

    expect(scene.bar.slots[0]).toBe(null);
    expect(scene.bar.slots[1]).toEqual({
      char: '兵', kind: 'base', tier: 2, level: 3, xp: 4,
    });
    timer.mockRestore();
  });

  it('still swaps bar slots when the units cannot merge', () => {
    const first = { char: '兵', kind: 'base', tier: 1, level: 1, xp: 0 };
    const second = { char: '弓', kind: 'base', tier: 1, level: 1, xp: 0 };
    const scene = sceneWithSlots([first, second, null, null, null]);

    dragSlot(scene, 0, 1);

    expect(scene.bar.slots[0]).toBe(second);
    expect(scene.bar.slots[1]).toBe(first);
  });
});
