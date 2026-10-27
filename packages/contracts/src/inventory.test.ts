import { describe, expect, it } from 'vitest';
import {
  MovementTypeSchema,
  StockAdjustmentInputSchema,
  StockAdjustmentResultSchema,
  StockRowSchema,
  StockSearchInputSchema,
  StockSearchResultSchema,
} from './inventory.js';

describe('StockSearchInputSchema', () => {
  it('accepts an empty search (all fields optional) and applies pagination defaults', () => {
    const result = StockSearchInputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('accepts a free-text query and a store filter', () => {
    const result = StockSearchInputSchema.safeParse({
      query: 'SKU001',
      storeId: 'store-b01',
      page: 2,
      pageSize: 50,
    });

    expect(result.success).toBe(true);
  });

  it('trims the query and treats a blank query as absent', () => {
    const result = StockSearchInputSchema.safeParse({ query: '   ' });

    // A blank/whitespace query must not survive as a meaningful filter.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query ?? '').toBe('');
    }
  });

  it('rejects a non-whole page size', () => {
    const result = StockSearchInputSchema.safeParse({ pageSize: 2.5 });

    expect(result.success).toBe(false);
  });
});

describe('StockRowSchema', () => {
  const base = {
    productId: 'p1',
    sku: 'SKU001',
    productName: 'Drinking water pack of 6',
    storeId: 'store-b01',
    quantity: 10,
    unit: 'packs',
    reorderThreshold: 3,
    lowStock: false,
  };

  it('accepts a healthy stock row', () => {
    expect(StockRowSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a zero-stock row flagged as low stock (stays visible)', () => {
    const result = StockRowSchema.safeParse({ ...base, quantity: 0, lowStock: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(0);
      expect(result.data.lowStock).toBe(true);
    }
  });

  it('rejects a negative quantity', () => {
    expect(StockRowSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
  });

  it('rejects a non-whole quantity', () => {
    expect(StockRowSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
  });

  it('requires the low-stock flag to be a boolean', () => {
    expect(StockRowSchema.safeParse({ ...base, lowStock: 'yes' }).success).toBe(false);
  });
});

describe('StockSearchResultSchema', () => {
  it('wraps stock rows in the shared pagination envelope', () => {
    const result = StockSearchResultSchema.safeParse({
      items: [
        {
          productId: 'p3',
          sku: 'SKU003',
          productName: 'Laundry detergent',
          storeId: 'store-b01',
          quantity: 0,
          unit: 'bags',
          reorderThreshold: 3,
          lowStock: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(result.success).toBe(true);
  });
});

describe('MovementTypeSchema', () => {
  it('accepts the three movement kinds', () => {
    for (const kind of ['RECEIPT', 'SALE', 'ADJUSTMENT']) {
      expect(MovementTypeSchema.safeParse(kind).success).toBe(true);
    }
  });

  it('rejects an unknown movement kind', () => {
    expect(MovementTypeSchema.safeParse('TRANSFER').success).toBe(false);
  });
});

describe('StockAdjustmentInputSchema', () => {
  const base = {
    productId: 'p1',
    storeId: 's1',
    delta: 5,
    reason: 'Physical count revealed missing items',
  };

  it('accepts a positive adjustment with a reason', () => {
    expect(StockAdjustmentInputSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a negative adjustment with a reason', () => {
    const result = StockAdjustmentInputSchema.safeParse({ ...base, delta: -3 });
    expect(result.success).toBe(true);
  });

  it('rejects a zero delta', () => {
    expect(StockAdjustmentInputSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
  });

  it('rejects an adjustment without a reason', () => {
    expect(StockAdjustmentInputSchema.safeParse({ ...base, reason: '' }).success).toBe(false);
  });

  it('rejects a non-integer delta', () => {
    expect(StockAdjustmentInputSchema.safeParse({ ...base, delta: 2.5 }).success).toBe(false);
  });
});

describe('StockAdjustmentResultSchema', () => {
  it('accepts a result with balance before and after', () => {
    const result = StockAdjustmentResultSchema.safeParse({
      balanceBefore: 10,
      balanceAfter: 15,
      delta: 5,
      documentNumber: 'ADJ-00001',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a negative balance', () => {
    const result = StockAdjustmentResultSchema.safeParse({
      balanceBefore: -1,
      balanceAfter: 5,
      delta: 6,
      documentNumber: 'ADJ-00001',
    });

    expect(result.success).toBe(false);
  });
});
