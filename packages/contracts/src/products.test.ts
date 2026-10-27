import { describe, expect, it } from 'vitest';
import {
  ProductCreateInputSchema,
  ProductListInputSchema,
  ProductSchema,
  ProductUpdateInputSchema,
  ReorderThresholdSchema,
} from './products.js';

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    sku: 'SKU001',
    name: 'Widget',
    category: 'Hardware',
    unit: 'ชิ้น',
    sellingPrice: 1999,
    ...overrides,
  };
}

describe('ReorderThresholdSchema', () => {
  it('accepts a store id and a whole non-negative threshold', () => {
    expect(ReorderThresholdSchema.parse({ storeId: 'store-01', reorderThreshold: 10 })).toEqual({
      storeId: 'store-01',
      reorderThreshold: 10,
    });
  });

  it('rejects a negative threshold', () => {
    expect(
      ReorderThresholdSchema.safeParse({ storeId: 'store-01', reorderThreshold: -1 }).success,
    ).toBe(false);
  });

  it('rejects a non-whole threshold', () => {
    expect(
      ReorderThresholdSchema.safeParse({ storeId: 'store-01', reorderThreshold: 2.5 }).success,
    ).toBe(false);
  });

  it('rejects a blank store id', () => {
    expect(ReorderThresholdSchema.safeParse({ storeId: '', reorderThreshold: 10 }).success).toBe(
      false,
    );
  });
});

describe('ProductCreateInputSchema', () => {
  it('accepts a full product and defaults active to true with no thresholds', () => {
    const parsed = ProductCreateInputSchema.parse(validCreate());
    expect(parsed.active).toBe(true);
    expect(parsed.reorderThresholds).toEqual([]);
    expect(parsed.sku).toBe('SKU001');
  });

  it('accepts per-store reorder thresholds', () => {
    const parsed = ProductCreateInputSchema.parse(
      validCreate({
        reorderThresholds: [
          { storeId: 'store-01', reorderThreshold: 5 },
          { storeId: 'store-02', reorderThreshold: 12 },
        ],
      }),
    );
    expect(parsed.reorderThresholds).toHaveLength(2);
  });

  it('rejects a blank SKU', () => {
    expect(ProductCreateInputSchema.safeParse(validCreate({ sku: '' })).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(ProductCreateInputSchema.safeParse(validCreate({ name: '' })).success).toBe(false);
  });

  it('rejects a negative selling price', () => {
    expect(ProductCreateInputSchema.safeParse(validCreate({ sellingPrice: -1 })).success).toBe(
      false,
    );
  });

  it('rejects a non-whole selling price', () => {
    expect(ProductCreateInputSchema.safeParse(validCreate({ sellingPrice: 19.99 })).success).toBe(
      false,
    );
  });

  it('rejects a negative reorder threshold inside the array', () => {
    expect(
      ProductCreateInputSchema.safeParse(
        validCreate({ reorderThresholds: [{ storeId: 'store-01', reorderThreshold: -5 }] }),
      ).success,
    ).toBe(false);
  });
});

describe('ProductUpdateInputSchema', () => {
  it('requires the id and the editable fields but not the SKU', () => {
    const parsed = ProductUpdateInputSchema.parse({
      id: 'p1',
      name: 'Widget renamed',
      category: 'Hardware',
      unit: 'ชิ้น',
      sellingPrice: 2500,
      active: true,
    });
    expect(parsed).toMatchObject({ id: 'p1', name: 'Widget renamed' });
    // The SKU is immutable: it must not be an accepted update field.
    expect('sku' in parsed).toBe(false);
  });

  it('rejects an update without an id', () => {
    expect(
      ProductUpdateInputSchema.safeParse({
        name: 'Widget',
        category: 'Hardware',
        unit: 'ชิ้น',
        sellingPrice: 2500,
        active: true,
      }).success,
    ).toBe(false);
  });

  it('rejects a deactivation payload with a negative price', () => {
    expect(
      ProductUpdateInputSchema.safeParse({
        id: 'p1',
        name: 'Widget',
        category: 'Hardware',
        unit: 'ชิ้น',
        sellingPrice: -100,
        active: false,
      }).success,
    ).toBe(false);
  });
});

describe('ProductListInputSchema', () => {
  it('defaults to the first page with active products only', () => {
    const parsed = ProductListInputSchema.parse({});
    expect(parsed).toMatchObject({ page: 1, pageSize: 20, includeInactive: false });
  });

  it('accepts includeInactive for historical lookups', () => {
    expect(ProductListInputSchema.parse({ includeInactive: true }).includeInactive).toBe(true);
  });
});

describe('ProductSchema', () => {
  it('exposes a product with all fields and ISO createdAt', () => {
    const product = {
      id: 'p1',
      sku: 'SKU001',
      name: 'Widget',
      category: 'Hardware',
      unit: 'ชิ้น',
      sellingPrice: 1999,
      active: true,
      reorderThresholds: [{ storeId: 'store-01', reorderThreshold: 5 }],
      createdAt: new Date().toISOString(),
    };
    expect(ProductSchema.parse(product)).toEqual(product);
  });

  it('defaults reorderThresholds to an empty array when omitted', () => {
    const parsed = ProductSchema.parse({
      id: 'p1',
      sku: 'SKU001',
      name: 'Widget',
      category: 'Hardware',
      unit: 'ชิ้น',
      sellingPrice: 1999,
      active: false,
      createdAt: new Date().toISOString(),
    });
    expect(parsed.reorderThresholds).toEqual([]);
  });
});
