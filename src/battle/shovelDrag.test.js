import { describe, expect, it } from 'vitest';
import { BattleScene } from './battleScene.js';
import { Effects } from './effects.js';
import { Grid } from './grid.js';
import { cellCenter } from '../config/map.js';

const SHOVEL_TILE = { x: 626, y: 1302 };
const noHit = { hitTest: () => false, onClick: () => {} };

function sceneWithShovels(shovels) {
  const scene = new BattleScene({});
  scene.grid = new Grid();
  scene.towers = [];
  scene.heroGroups = [];
  scene.enemies = [];
  scene.effects = new Effects();
  scene.selected = null;
  scene.settingsOpen = false;
  scene.campOpen = false;
  scene.volumeDragging = false;
  scene.pointer = { x: 0, y: 0 };
  scene.actives = [];
  scene.bar = { shovels, slots: Array(5).fill(null) };
  scene.btnSpeed = noHit;
  scene.btnPause = noHit;
  scene.btnCamp = noHit;
  scene.btnGear = noHit;
  scene.btnRefresh = noHit;
  scene.btnShovel = {
    hitTest: (x, y) => x >= 521 && x <= 732 && y >= 1276 && y <= 1328,
    onClick: () => {},
  };
  scene.btnResume = noHit;
  scene.btnExit = noHit;
  scene.btnCloseCamp = noHit;
  return scene;
}

function shovelDrag(scene) {
  scene.drag = {
    source: 'shovel', char: '铲', x: SHOVEL_TILE.x, y: SHOVEL_TILE.y,
    downX: SHOVEL_TILE.x, downY: SHOVEL_TILE.y, moved: true,
  };
}

describe('shovel drag interaction', () => {
  it('activates a slot through the full pointer-down, move, and pointer-up sequence', () => {
    const scene = sceneWithShovels(1);
    const target = cellCenter(0, 0);

    scene.onPointerDown(SHOVEL_TILE.x, SHOVEL_TILE.y);
    scene.onPointerMove(target.x, target.y);
    scene.onPointerUp(target.x, target.y);

    expect(scene.drag).toBe(null);
    expect(scene.grid.get(0, 0).active).toBe(true);
    expect(scene.bar.shovels).toBe(0);
  });

  it('starts a shovel drag on pointer-down without consuming a shovel', () => {
    const scene = sceneWithShovels(2);

    scene.onPointerDown(SHOVEL_TILE.x, SHOVEL_TILE.y);

    expect(scene.drag).toEqual({
      source: 'shovel', char: '铲', x: 626, y: 1302,
      downX: 626, downY: 1302, moved: false,
    });
    expect(scene.bar.shovels).toBe(2);
  });

  it('activates an inactive slot and consumes exactly one shovel on a valid drop', () => {
    const scene = sceneWithShovels(2);
    const target = cellCenter(0, 0);
    shovelDrag(scene);

    scene.onPointerUp(target.x, target.y);

    expect(scene.grid.get(0, 0).active).toBe(true);
    expect(scene.bar.shovels).toBe(1);
  });

  it.each([
    ['an active slot', cellCenter(1, 0)],
    ['a road cell', cellCenter(0, 1)],
    ['outside the board', { x: 20, y: 20 }],
  ])('keeps count and board unchanged when dropped on %s', (_name, target) => {
    const scene = sceneWithShovels(2);
    shovelDrag(scene);

    scene.onPointerUp(target.x, target.y);

    expect(scene.bar.shovels).toBe(2);
    expect(scene.grid.get(0, 0).active).toBe(false);
  });

  it('never starts or applies a shovel drag when no shovels remain', () => {
    const scene = sceneWithShovels(0);
    const target = cellCenter(0, 0);

    scene.onPointerDown(SHOVEL_TILE.x, SHOVEL_TILE.y);
    expect(scene.drag).toBeUndefined();

    shovelDrag(scene);
    scene.onPointerUp(target.x, target.y);
    expect(scene.grid.get(0, 0).active).toBe(false);
    expect(scene.bar.shovels).toBe(0);
  });

  it.each(['settings', 'camp'])('cancels and gates a shovel drop while %s is open', (modal) => {
    const scene = sceneWithShovels(1);
    const target = cellCenter(0, 0);
    scene[modal + 'Open'] = true;
    shovelDrag(scene);

    scene.onPointerUp(target.x, target.y);
    scene.onPointerDown(SHOVEL_TILE.x, SHOVEL_TILE.y);

    expect(scene.drag).toBe(null);
    expect(scene.grid.get(0, 0).active).toBe(false);
    expect(scene.bar.shovels).toBe(1);
  });
});
