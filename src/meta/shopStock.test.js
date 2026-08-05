import { describe, expect, it } from 'vitest';
import { ITEMS, upgradeCost } from '../config/items.js';
import {
  buyShopStockItem,
  ensureShopStock,
  refreshShopAfterBattle,
  rollShopStock,
} from './shopStock.js';

describe('shop stock', () => {
  it('rolls at most four unique items with injected randomness', () => {
    const stock = rollShopStock(['fire', 'power'], () => 0.4);

    expect(stock).toHaveLength(4);
    expect(new Set(stock).size).toBe(4);
    for (const id of stock) expect(ITEMS[id]).toBeDefined();
  });

  it('rolls four items even when every item is already owned', () => {
    const ids = Object.keys(ITEMS);
    expect(rollShopStock(ids, () => 0.4)).toHaveLength(4);
  });

  it('includes already-owned items in the rolled stock', () => {
    const stock = rollShopStock(['fire', 'power'], () => 0.4);
    expect(stock.some((id) => ['fire', 'power'].includes(id))).toBe(true);
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

    expect(buyShopStockItem(save, 'fire')).toEqual({ purchased: true, id: 'fire', cost: ITEMS.fire.price, upgraded: false });
    expect(save.gold).toBe(1000 - ITEMS.fire.price);
    expect(save.items.owned.fire).toBe(1);
    expect(save.shop.stock).toEqual(['recruit']);
    expect(ensureShopStock(save, () => 0.5)).toEqual(['recruit']);
  });

  it('upgrades an owned item on purchase instead of rejecting it', () => {
    const save = freshSave();
    save.items.owned = { fire: 2 };
    save.gold = 1000;
    save.shop = { initialized: true, stock: ['fire', 'power'] };
    const result = buyShopStockItem(save, 'fire');
    expect(result).toMatchObject({ purchased: true, id: 'fire' });
    expect(save.items.owned.fire).toBe(3); // upgraded
    expect(result.cost).toBe(upgradeCost('fire', 2));
  });

  it('rejects missing and unaffordable stock without mutation, upgrades owned stock', () => {
    const save = freshSave();
    save.gold = 0;
    save.items.owned.fire = 1;
    save.shop = { initialized: true, stock: ['fire', 'recruit'] };

    expect(buyShopStockItem(save, 'missing').purchased).toBe(false);
    expect(buyShopStockItem(save, 'recruit').reason).toBe('gold');
    expect(save.shop.stock).toEqual(['fire', 'recruit']);

    save.gold = upgradeCost('fire', 1);
    const result = buyShopStockItem(save, 'fire');
    expect(result).toMatchObject({ purchased: true, id: 'fire', upgraded: true });
    expect(save.items.owned.fire).toBe(2);
    expect(result.cost).toBe(upgradeCost('fire', 1));
    expect(save.shop.stock).toEqual(['recruit']);
  });

  it('refreshes an initialized stock only through battle settlement', () => {
    const save = freshSave();
    save.shop = { initialized: true, stock: [] };

    expect(ensureShopStock(save, () => 0)).toEqual([]);
    const refreshed = refreshShopAfterBattle(save, () => 0.8);
    expect(refreshed).toHaveLength(4);
    expect(save.shop.stock).toEqual(refreshed);
  });

  it('keeps externally acquired stock in the pool without backfilling', () => {
    const save = freshSave();
    save.shop = { initialized: true, stock: ['fire', 'recruit'] };

    save.items.owned.fire = 1;
    expect(ensureShopStock(save, () => 0.5)).toEqual(['fire', 'recruit']);

    delete save.items.owned.fire;
    expect(ensureShopStock(save, () => 0.5)).toEqual(['fire', 'recruit']);
  });

  it('keeps the freshly refreshed stock when the shop is next opened', () => {
    const save = freshSave();
    save.items.owned = { fire: 1 };
    save.shop = { initialized: true, stock: ['recruit', 'train'] };
    const refreshed = refreshShopAfterBattle(save, () => 0);
    expect(refreshed).toHaveLength(4);
    expect(refreshed).toEqual(rollShopStock(Object.keys(save.items.owned), () => 0));
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
