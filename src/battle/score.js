// 计分与结算
import { coinsFor } from '../config/economy.js';

export class Score {
  constructor() {
    this.wave = 0;
    this.kills = 0;
  }

  coins(coinBuff = 0) {
    return Math.round(coinsFor(this.wave, this.kills) * (1 + coinBuff));
  }
}
