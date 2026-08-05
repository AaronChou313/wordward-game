import { describe, expect, it } from 'vitest';
import { ITEMS } from '../config/items.js';
import {
  buyShopStockItem,
  ensureShopStock,
  refreshShopAfterBattle,
  rollShopStock,
} from './shopStock.js';

describe('shop stock', () => {
  it('rolls at most four unique unowned items with injected randomness', () => {
    const stock = rollShopStock(['fire', 'power'], () => 0.4);

    expect(stock).toHaveLength(4);
    expect(new Set(stock).size).toBe(4);
    expect(stock).not.toContain('fire');
    expect(stock).not.toContain('power');
    for (const id of stock) expect(ITEMS[id]).toBeDefined();
  });

  it('returns every remaining item when fewer than four are unowned', () => {
    const ids = Object.keys(ITEMS);
    const remaining = ids.slice(-2);

    expect(rollShopStock(ids.slice(0, -2), () => 0).sort()).toEqual(remaining.sort());
  });

  it('initializes once and remains stable between shop visits', () => {
    const save = freshSave();
    const first = ensureShopStock(save, () => 0);
    const second = ensureShopStock(save, () => 0.99);

    expect(second).toEqual(first);
    expect(save.shop.initialized).toBe(true);
  });

  it('removes a purchased item without refilling the empty slot', () => {
    const save = freshSave();
    save.gold = 1000;
    save.shop = { initialized: true, stock: ['fire', 'recruit'] };

    expect(buyShopStockItem(save, 'fire')).toEqual({ purchased: true, id: 'fire', cost: ITEMS.fire.price });
    expect(save.gold).toBe(1000 - ITEMS.fire.price);
    expect(save.items.owned.fire).toBe(1);
    expect(save.shop.stock).toEqual(['recruit']);
    expect(ensureShopStock(save, () => 0.5)).toEqual(['recruit']);
  });

  it('rejects missing, owned, and unaffordable stock without mutation', () => {
    const save = freshSave();
    save.gold = 0;
    save.items.owned.fire = 1;
    save.shop = { initialized: true, stock: ['fire', 'recruit'] };

    expect(buyShopStockItem(save, 'missing').purchased).toBe(false);
    expect(buyShopStockItem(save, 'fire').reason).toBe('owned');
    expect(buyShopStockItem(save, 'recruit').reason).toBe('gold');
    expect(save.shop.stock).toEqual(['fire', 'recruit']);
  });

  it('refreshes an initialized stock only through battle settlement', () => {
    const save = freshSave();
    save.shop = { initialized: true, stock: [] };

    expect(ensureShopStock(save, () => 0)).toEqual([]);
    const refreshed = refreshShopAfterBattle(save, () => 0.8);
    expect(refreshed).toHaveLength(4);
    expect(save.shop.stock).toEqual(refreshed);
  });

  it('filters externally acquired stock without backfilling after a later sale', () => {
    const save = freshSave();
    save.shop = { initialized: true, stock: ['fire', 'recruit'] };

    save.items.owned.fire = 1;
    expect(ensureShopStock(save, () => 0.5)).toEqual(['recruit']);

    delete save.items.owned.fire;
    expect(ensureShopStock(save, () => 0.5)).toEqual(['recruit']);
  });

  it('keeps the freshly refreshed stock when the shop is next opened', () => {
    const save = freshSave();
    save.items.owned = { fire: 1 };
    save.shop = { initialized: true, stock: ['recruit', 'train'] };
    const refreshed = refreshShopAfterBattle(save, () => 0);
    expect(refreshed).toHaveLength(4);
    expect(save.shop.stock).not.toContain('fire');
    const reopened = ensureShopStock(save, () => 0.9);
    expect(reopened).toEqual(save.shop.stock); // must not clear the fresh stock
    expect(reopened).toHaveLength(4);
  });
});

function freshSave() {
  return {
    gold: 300,
    items: { owned: {}, equippedActive: [], equippedPassive: [] },
    shop: { initialized: false, stock: [] },
  };
}
