import { describe, expect, it } from 'vitest';
import {
  AuditRecordSchema,
  PaginationInputSchema,
  StoreCreateInputSchema,
  StoreSchema,
  StoreUpdateInputSchema,
  SupplierCreateInputSchema,
  SupplierSchema,
  SupplierUpdateInputSchema,
  paginatedListSchema,
} from './master-data.js';

describe('PaginationInputSchema', () => {
  it('defaults to the first page with a sane page size', () => {
    const parsed = PaginationInputSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('accepts an explicit page and page size', () => {
    expect(PaginationInputSchema.parse({ page: 3, pageSize: 50 })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects a non-positive page', () => {
    expect(PaginationInputSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PaginationInputSchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('rejects a non-whole page or page size', () => {
    expect(PaginationInputSchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(PaginationInputSchema.safeParse({ pageSize: 2.5 }).success).toBe(false);
  });

  it('rejects a page size over the allowed maximum', () => {
    expect(PaginationInputSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('paginatedListSchema', () => {
  it('wraps items with pagination metadata', () => {
    const schema = paginatedListSchema(StoreSchema);
    const page = {
      items: [{ id: 's1', code: 'B01', name: 'Branch 01', createdAt: new Date().toISOString() }],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    expect(schema.parse(page)).toEqual(page);
  });

  it('rejects a payload missing the total count', () => {
    const schema = paginatedListSchema(StoreSchema);
    expect(schema.safeParse({ items: [], page: 1, pageSize: 20 }).success).toBe(false);
  });
});

describe('StoreCreateInputSchema', () => {
  it('accepts a code and a name', () => {
    expect(StoreCreateInputSchema.parse({ code: 'B01', name: 'Branch 01' })).toEqual({
      code: 'B01',
      name: 'Branch 01',
    });
  });

  it('rejects a blank code', () => {
    expect(StoreCreateInputSchema.safeParse({ code: '', name: 'Branch 01' }).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(StoreCreateInputSchema.safeParse({ code: 'B01', name: '' }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(StoreCreateInputSchema.safeParse({ code: 'B01' }).success).toBe(false);
  });
});

describe('StoreUpdateInputSchema', () => {
  it('requires the store id alongside the editable fields', () => {
    expect(
      StoreUpdateInputSchema.parse({ id: 's1', code: 'B01', name: 'Branch 01 renamed' }),
    ).toEqual({ id: 's1', code: 'B01', name: 'Branch 01 renamed' });
  });

  it('rejects an update without an id', () => {
    expect(StoreUpdateInputSchema.safeParse({ code: 'B01', name: 'Branch 01' }).success).toBe(
      false,
    );
  });
});

describe('SupplierCreateInputSchema', () => {
  it('accepts a code, name, and contact', () => {
    expect(
      SupplierCreateInputSchema.parse({
        code: 'SUP01',
        name: 'Supplier 01',
        contact: '02-123-4567',
      }),
    ).toEqual({ code: 'SUP01', name: 'Supplier 01', contact: '02-123-4567' });
  });

  it('allows an empty contact (optional detail)', () => {
    const parsed = SupplierCreateInputSchema.parse({ code: 'SUP01', name: 'Supplier 01' });
    expect(parsed.contact).toBe('');
  });

  it('rejects a blank code', () => {
    expect(SupplierCreateInputSchema.safeParse({ code: '', name: 'Supplier 01' }).success).toBe(
      false,
    );
  });

  it('rejects a blank name', () => {
    expect(SupplierCreateInputSchema.safeParse({ code: 'SUP01', name: '' }).success).toBe(false);
  });
});

describe('SupplierUpdateInputSchema', () => {
  it('requires the supplier id', () => {
    expect(
      SupplierUpdateInputSchema.parse({
        id: 'sup1',
        code: 'SUP01',
        name: 'Supplier 01',
        contact: '02-000-0000',
      }),
    ).toMatchObject({ id: 'sup1' });
  });

  it('rejects an update without an id', () => {
    expect(
      SupplierUpdateInputSchema.safeParse({ code: 'SUP01', name: 'Supplier 01' }).success,
    ).toBe(false);
  });
});

describe('StoreSchema / SupplierSchema', () => {
  it('exposes a store with id, code, name, and createdAt', () => {
    const store = { id: 's1', code: 'B01', name: 'Branch 01', createdAt: new Date().toISOString() };
    expect(StoreSchema.parse(store)).toEqual(store);
  });

  it('exposes a supplier with id, code, name, contact, and createdAt', () => {
    const supplier = {
      id: 'sup1',
      code: 'SUP01',
      name: 'Supplier 01',
      contact: '02-123-4567',
      createdAt: new Date().toISOString(),
    };
    expect(SupplierSchema.parse(supplier)).toEqual(supplier);
  });
});

describe('AuditRecordSchema', () => {
  it('captures actor, action, outcome, and timestamp', () => {
    const record = {
      id: 'a1',
      actorId: 'u1',
      action: 'store.create',
      entity: 'store',
      entityId: 's1',
      outcome: 'success',
      createdAt: new Date().toISOString(),
    };
    expect(AuditRecordSchema.parse(record)).toEqual(record);
  });

  it('rejects an unknown outcome', () => {
    expect(
      AuditRecordSchema.safeParse({
        id: 'a1',
        actorId: 'u1',
        action: 'store.create',
        entity: 'store',
        entityId: 's1',
        outcome: 'maybe',
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
