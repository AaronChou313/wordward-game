// 入口：初始化画布、输入、场景，启动主循环
import { startLoop } from './core/loop.js';
import { SceneManager } from './core/scene.js';
import { setupInput, DESIGN_W, DESIGN_H } from './core/input.js';
import { preloadImages } from './core/assets.js';
import { HomeScene } from './meta/homeScene.js';
import { ShopScene } from './meta/shop.js';
import { InventoryScene } from './meta/inventory.js';
import { GachaScene } from './meta/gacha.js';
import { EquipScene } from './meta/equipScene.js';
import { CodexScene } from './meta/codexScene.js';
import { BattleScene } from './battle/battleScene.js';
import { Audio } from './core/audio.js';
import { getSave } from './meta/saveData.js';
import { AccountScene } from './meta/accountScene.js';
import { ProfileScene } from './meta/profileScene.js';
import { RankingScene } from './meta/rankingScene.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scenes = new SceneManager();
scenes.register('home', new HomeScene(scenes));
scenes.register('shop', new ShopScene(scenes));
scenes.register('inventory', new InventoryScene(scenes));
scenes.register('gacha', new GachaScene(scenes));
scenes.register('equip', new EquipScene(scenes));
scenes.register('codex', new CodexScene(scenes));
scenes.register('account', new AccountScene(scenes));
scenes.register('profile', new ProfileScene(scenes));
scenes.register('ranking', new RankingScene(scenes));
scenes.register('battle', new BattleScene(scenes));

const view = setupInput(canvas, {
  pointerDown: (x, y) => scenes.pointerDown(x, y),
  pointerMove: (x, y) => scenes.pointerMove(x, y),
  pointerUp: (x, y) => scenes.pointerUp(x, y),
});

preloadImages(() => {
  Audio.setVolume(getSave().settings.volume / 100);
  scenes.switch('home');
  startLoop(
    (dt) => scenes.update(dt),
    () => {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = '#0d0a08';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);
      scenes.render(ctx);
    }
  );
});
