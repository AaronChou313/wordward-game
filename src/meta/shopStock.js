import { ITEMS } from '../config/items.js';

export function rollShopStock(ownedIds, random = Math.random, count = 4) {
  const owned = new Set(ownedIds || []);
  const available = Object.keys(ITEMS).filter((id) => !owned.has(id));
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
    if (!ITEMS[id] || save.items.owned[id] || seen.has(id)) return false;
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
  if (save.items.owned[id]) return { purchased: false, reason: 'owned' };
  if (save.gold < item.price) return { purchased: false, reason: 'gold' };

  save.gold -= item.price;
  save.items.owned[id] = 1;
  save.shop.stock = save.shop.stock.filter((entry) => entry !== id);
  return { purchased: true, id, cost: item.price };
}
