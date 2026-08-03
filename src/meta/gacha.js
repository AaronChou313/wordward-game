// 数据驱动抽奖池：概率、双保底、奖励记录与滚动展示
import { Button } from '../ui/button.js';
import { drawPanel } from '../ui/panel.js';
import { Toast } from '../ui/toast.js';
import { Audio } from '../core/audio.js';
import { GACHA_COST } from '../config/economy.js';
import { effectiveGachaRates, GACHA_RATES, GACHA_REWARDS, rewardChance } from '../config/gacha.js';
import { getSave, persist } from './saveData.js';
import { drawGacha } from './gachaEngine.js';

const RARITY_LABELS = { common: '普通', rare: '稀有', precious: '珍贵' };

function formatPercent(rate) {
  return (rate * 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + '%';
}

function formatRateLine(rates) {
  return Object.entries(rates)
    .map(([rarity, rate]) => `${RARITY_LABELS[rarity]} ${formatPercent(rate)}`)
    .join(' · ');
}

export function gachaPanelModel(save) {
  const nextRates = effectiveGachaRates(save.gacha);
  const rewardRows = Object.entries(GACHA_REWARDS).flatMap(([rarity, rewards]) => (
    rewards.map((reward) => ({
      rarity,
      text: `${RARITY_LABELS[rarity]} · ${reward.label} · ${formatPercent(rewardChance(rarity, reward, nextRates))}`,
    }))
  ));

  return {
    baseRateLine: formatRateLine(GACHA_RATES),
    nextRateLine: formatRateLine(nextRates),
    pityLines: [
      `小保底：${Math.max(1, 10 - save.gacha.smallPity)} 抽内必出稀有或以上`,
      `大保底：${Math.max(1, 50 - save.gacha.bigPity)} 抽内必出珍贵`,
    ],
    rewardRows,
    history: save.gacha.history,
  };
}

export function performGachaPull(save, random = Math.random) {
  if (save.gold < GACHA_COST) return { ok: false, reason: 'insufficient-gold' };
  save.gold -= GACHA_COST;
  return { ok: true, result: drawGacha(save, random) };
}

export class GachaScene {
  constructor(scenes) {
    this.scenes = scenes;
    this.btnBack = new Button(39, 40, 140, 56, '返回', () => { Audio.click(); scenes.switch('home'); }, { fontSize: 26 });
    this.btnPull = new Button(225, 1165, 300, 80, '抽取 ' + GACHA_COST + ' 金', () => this.pull(), { fontSize: 32, bg: '#6a4a1a' });
    this.result = null;
    this.resultTimer = 0;
    this.scroll = 0;
    this.dragY = null;
    this.dragStartScroll = 0;
  }

  enter() {
    this.result = null;
    this.scroll = 0;
    this.dragY = null;
  }

  pull() {
    const save = getSave();
    const outcome = performGachaPull(save);
    if (!outcome.ok) return Toast.show('金币不足');
    Audio.coin();
    persist();
    this.result = outcome.result.message;
    this.resultTimer = 3;
    Audio.hero();
  }

  update(dt) {
    Toast.update(dt);
    if (this.resultTimer > 0) this.resultTimer -= dt;
  }

  onPointerDown(x, y) {
    if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
    if (this.btnPull.hitTest(x, y)) return this.btnPull.onClick();
    if (x >= 50 && x <= 700 && y >= 200 && y <= 1100) {
      this.dragY = y;
      this.dragStartScroll = this.scroll;
    }
  }

  onPointerMove(_x, y) {
    if (this.dragY == null) return;
    const next = this.dragStartScroll + this.dragY - y;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), next));
  }

  onPointerUp() {
    this.dragY = null;
  }

  maxScroll() {
    const historyCount = gachaPanelModel(getSave()).history.length;
    return Math.max(0, 835 + Math.max(1, historyCount) * 38 - 1100);
  }

  render(ctx) {
    ctx.fillStyle = '#181209';
    ctx.fillRect(0, 0, 750, 1334);
    drawPanel(ctx, 25, 120, 700, 1160, '抽 奖');
    this.btnBack.draw(ctx);

    const save = getSave();
    const model = gachaPanelModel(save);
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c35a';
    ctx.font = '30px KaiTi, STKaiti, serif';
    ctx.fillText(`金币 ${save.gold}`, 700, 70);

    ctx.beginPath();
    ctx.rect(50, 200, 650, 900);
    ctx.clip();
    ctx.translate(0, -this.scroll);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a7658';
    ctx.font = '20px KaiTi, STKaiti, serif';
    ctx.fillText(`基础概率：${model.baseRateLine}`, 375, 225);

    ctx.fillStyle = '#e8c35a';
    ctx.font = '25px KaiTi, STKaiti, serif';
    ctx.fillText(`下一抽：${model.nextRateLine}`, 375, 265);

    ctx.fillStyle = '#c9a86a';
    ctx.font = '23px KaiTi, STKaiti, serif';
    ctx.fillText(model.pityLines[0], 375, 310);
    ctx.fillText(model.pityLines[1], 375, 346);

    ctx.fillStyle = '#f0d8a8';
    ctx.font = '28px KaiTi, STKaiti, serif';
    ctx.fillText('下一抽各奖励类别概率', 375, 400);

    ctx.textAlign = 'left';
    ctx.font = '22px KaiTi, STKaiti, serif';
    model.rewardRows.forEach((row, index) => {
      ctx.fillStyle = row.rarity === 'precious' ? '#ffd75a' : row.rarity === 'rare' ? '#b8d8ff' : '#a8895a';
      ctx.fillText(row.text, 105, 440 + index * 40);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0d8a8';
    ctx.font = '28px KaiTi, STKaiti, serif';
    ctx.fillText('最近结果', 375, 790);

    ctx.textAlign = 'left';
    ctx.font = '22px KaiTi, STKaiti, serif';
    if (model.history.length === 0) {
      ctx.fillStyle = '#6a5a42';
      ctx.fillText('暂无抽取记录', 105, 835);
    } else {
      model.history.forEach((entry, index) => {
        ctx.fillStyle = entry.rarity === 'precious' ? '#ffd75a' : entry.rarity === 'rare' ? '#b8d8ff' : '#a8895a';
        ctx.fillText(entry.message, 105, 835 + index * 38);
      });
    }
    ctx.restore();

    this.btnPull.draw(ctx);

    if (this.result && this.resultTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75a';
      ctx.font = '28px KaiTi, STKaiti, serif';
      ctx.shadowColor = '#7a4a20';
      ctx.shadowBlur = 16;
      ctx.fillText(this.result, 375, 1135);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6a5a42';
      ctx.font = '18px KaiTi, STKaiti, serif';
      ctx.fillText('上下拖动查看完整奖池与记录', 375, 1135);
      ctx.restore();
    }

    Toast.render(ctx);
  }
}
