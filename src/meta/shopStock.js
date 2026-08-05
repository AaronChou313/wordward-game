import { ITEMS, upgradeCost } from '../config/items.js';

export function rollShopStock(ownedIds, random = Math.random, count = 4) {
  // 全量道具池：未拥有与已拥有均可出现在商店，已拥有购买即升级
  const available = Object.keys(ITEMS).slice();
  for (let i = available.length - 1; i > 0; i--) {
    const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    const index = Math.floor(roll * (i + 1));
    [available[i], available[index]] = [available[index], available[i]];
  }
  return available.slice(0, Math.max(0, count));
}

export function ensureShopStock(save, random = Math.random) {
  if (!save.shop) save.shop = { initialized: false, stock: [] };
  if (!save.shop.initialized) {
    save.shop.stock = rollShopStock(Object.keys(save.items.owned), random);
    save.shop.initialized = true;
    return save.shop.stock;
  }

  const seen = new Set();
  save.shop.stock = (save.shop.stock || []).filter((id) => {
    if (!ITEMS[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 4);
  return save.shop.stock;
}

export function refreshShopAfterBattle(save, random = Math.random) {
  if (!save.shop) save.shop = { initialized: true, stock: [] };
  save.shop.stock = rollShopStock(Object.keys(save.items.owned), random);
  save.shop.initialized = true;
  return save.shop.stock;
}

export function buyShopStockItem(save, id) {
  const item = ITEMS[id];
  if (!item || !save.shop || !save.shop.stock.includes(id)) {
    return { purchased: false, reason: 'stock' };
  }
  const currentLevel = save.items.owned[id] || 0;
  const cost = currentLevel >= 1 ? upgradeCost(id, currentLevel) : item.price;
  if (save.gold < cost) return { purchased: false, reason: 'gold' };

  save.gold -= cost;
  save.items.owned[id] = currentLevel + 1;
  save.shop.stock = save.shop.stock.filter((entry) => entry !== id);
  // 同步已装备等级
  for (const list of [save.items.equippedActive, save.items.equippedPassive]) {
    const eq = list.find((e) => e.id === id);
    if (eq) eq.level = currentLevel + 1;
  }
  return { purchased: true, id, cost, upgraded: currentLevel >= 1 };
}
