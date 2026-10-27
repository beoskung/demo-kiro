import { describe, expect, it } from 'vitest';
import {
  PurchaseOrderCreateInputSchema,
  PurchaseOrderLineInputSchema,
  PurchaseOrderSchema,
  PurchaseOrderUpdateInputSchema,
} from './purchase-orders.js';

describe('PurchaseOrderLineInputSchema', () => {
  it('accepts a valid line', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 20,
      unitPrice: 4500,
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero orderedQuantity', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 0,
      unitPrice: 4500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative orderedQuantity', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: -5,
      unitPrice: 4500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects fractional orderedQuantity', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 20.5,
      unitPrice: 4500,
    });
    expect(result.success).toBe(false);
  });

  it('accepts zero unitPrice', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 20,
      unitPrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative unitPrice', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 20,
      unitPrice: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects fractional unitPrice', () => {
    const result = PurchaseOrderLineInputSchema.safeParse({
      productId: 'p1',
      orderedQuantity: 20,
      unitPrice: 45.99,
    });
    expect(result.success).toBe(false);
  });
});

describe('PurchaseOrderCreateInputSchema', () => {
  const validInput = {
    supplierId: 's1',
    destinationStoreId: 'store1',
    expectedReceiptDate: '2024-12-01',
    lines: [{ productId: 'p1', orderedQuantity: 20, unitPrice: 4500 }],
  };

  it('accepts valid input with one line', () => {
    const result = PurchaseOrderCreateInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts multiple lines', () => {
    const result = PurchaseOrderCreateInputSchema.safeParse({
      ...validInput,
      lines: [
        { productId: 'p1', orderedQuantity: 20, unitPrice: 4500 },
        { productId: 'p2', orderedQuantity: 10, unitPrice: 3000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty lines array', () => {
    const result = PurchaseOrderCreateInputSchema.safeParse({
      ...validInput,
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate productId in lines', () => {
    const result = PurchaseOrderCreateInputSchema.safeParse({
      ...validInput,
      lines: [
        { productId: 'p1', orderedQuantity: 20, unitPrice: 4500 },
        { productId: 'p1', orderedQuantity: 10, unitPrice: 5000 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('PurchaseOrderUpdateInputSchema', () => {
  const validInput = {
    id: 'po1',
    supplierId: 's1',
    destinationStoreId: 'store1',
    expectedReceiptDate: '2024-12-01',
    lines: [{ productId: 'p1', orderedQuantity: 20, unitPrice: 4500 }],
  };

  it('accepts valid update input', () => {
    const result = PurchaseOrderUpdateInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects duplicate productId in lines', () => {
    const result = PurchaseOrderUpdateInputSchema.safeParse({
      ...validInput,
      lines: [
        { productId: 'p1', orderedQuantity: 20, unitPrice: 4500 },
        { productId: 'p1', orderedQuantity: 15, unitPrice: 4600 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one line', () => {
    const result = PurchaseOrderUpdateInputSchema.safeParse({
      ...validInput,
      lines: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('PurchaseOrderSchema', () => {
  it('accepts a valid purchase order', () => {
    const result = PurchaseOrderSchema.safeParse({
      id: 'po1',
      documentNumber: 'PO-00001',
      supplierId: 's1',
      destinationStoreId: 'store1',
      expectedReceiptDate: '2024-12-01T00:00:00.000Z',
      status: 'DRAFT',
      createdById: 'u1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lines: [
        {
          id: 'line1',
          productId: 'p1',
          orderedQuantity: 20,
          unitPrice: 4500,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
