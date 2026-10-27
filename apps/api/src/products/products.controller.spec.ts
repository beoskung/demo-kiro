import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema } from '@erp/contracts';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { makeUser } from '../auth/test-user.js';
import { ProductsController } from './products.controller.js';

type PrismaStub = {
  product: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  auditRecord: {
    create: ReturnType<typeof vi.fn>;
  };
};

const admin = makeUser('ADMINISTRATOR', { id: 'admin-1' });
const storeEmployee = makeUser('STORE_EMPLOYEE', { id: 'emp-1' });
const manager = makeUser('MANAGER', { id: 'mgr-1' });
const purchasing = makeUser('PURCHASING_OFFICER', { id: 'po-1' });

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sku: 'SKU001',
    name: 'Widget',
    category: 'Hardware',
    unit: 'ชิ้น',
    sellingPrice: 1999,
    active: true,
    referenced: false,
    createdAt: new Date('2026-10-27T00:00:00.000Z'),
    stockLevels: [],
    ...overrides,
  };
}

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    sku: 'SKU001',
    name: 'Widget',
    category: 'Hardware',
    unit: 'ชิ้น',
    sellingPrice: 1999,
    ...overrides,
  };
}

function validUpdateInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Widget',
    category: 'Hardware',
    unit: 'ชิ้น',
    sellingPrice: 1999,
    active: true,
    ...overrides,
  };
}

let prisma: PrismaStub;

async function createController() {
  prisma = {
    product: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    auditRecord: { create: vi.fn() },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(ProductsController);
}

function expectEnvelope(error: { code?: string; data?: unknown }) {
  const envelope = ErrorEnvelopeSchema.parse(error.data);
  expect(envelope.message).toMatch(/[\u0E00-\u0E7F]/); // Thai message
  expect(JSON.stringify(error.data)).not.toMatch(/stack|prisma|at /i);
  return envelope;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsController — create', () => {
  it('lets an administrator create a product with per-store thresholds and audits success', async () => {
    const controller = await createController();
    prisma.product.create.mockResolvedValue(
      productRow({ stockLevels: [{ storeId: 'store-01', reorderThreshold: 5 }] }),
    );

    const result = await call(
      controller.createProduct(admin),
      validCreateInput({ reorderThresholds: [{ storeId: 'store-01', reorderThreshold: 5 }] }),
      { context: {} },
    );

    expect(result).toMatchObject({ id: 'p1', sku: 'SKU001', active: true });
    expect(result.reorderThresholds).toEqual([{ storeId: 'store-01', reorderThreshold: 5 }]);
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sku: 'SKU001',
          sellingPrice: 1999,
          active: true,
          stockLevels: { create: [{ storeId: 'store-01', reorderThreshold: 5 }] },
        }),
        include: { stockLevels: true },
      }),
    );
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'product.create',
        entity: 'product',
        entityId: 'p1',
        outcome: 'success',
      }),
    });
  });

  it('rejects a duplicate SKU with the CONFLICT envelope and audits the failure', async () => {
    const controller = await createController();
    prisma.product.create.mockRejectedValue({ code: 'P2002' });

    const error = await call(controller.createProduct(admin), validCreateInput(), {
      context: {},
    }).catch((e) => e);

    expect(error.code).toBe('CONFLICT');
    expect(expectEnvelope(error).category).toBe('retry');
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'product.create', outcome: 'failure' }),
    });
  });

  it('rejects a negative selling price at the contract boundary', async () => {
    const controller = await createController();

    const error = await call(
      controller.createProduct(admin),
      validCreateInput({ sellingPrice: -1 }),
      { context: {} },
    ).catch((e) => e);

    expect(error).toBeDefined();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a negative reorder threshold at the contract boundary', async () => {
    const controller = await createController();

    const error = await call(
      controller.createProduct(admin),
      validCreateInput({ reorderThresholds: [{ storeId: 'store-01', reorderThreshold: -5 }] }),
      { context: {} },
    ).catch((e) => e);

    expect(error).toBeDefined();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a non-whole stock quantity-style threshold at the contract boundary', async () => {
    const controller = await createController();

    const error = await call(
      controller.createProduct(admin),
      validCreateInput({ reorderThresholds: [{ storeId: 'store-01', reorderThreshold: 2.5 }] }),
      { context: {} },
    ).catch((e) => e);

    expect(error).toBeDefined();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a non-administrator creating a product with the FORBIDDEN envelope', async () => {
    const controller = await createController();

    const error = await call(controller.createProduct(storeEmployee), validCreateInput(), {
      context: {},
    }).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expect(expectEnvelope(error).category).toBe('correct-input');
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});

describe('ProductsController — update (SKU immutable)', () => {
  it('edits a product without ever writing the SKU', async () => {
    const controller = await createController();
    prisma.product.update.mockResolvedValue(productRow({ name: 'Widget renamed' }));

    const result = await call(
      controller.updateProduct(admin),
      validUpdateInput({ name: 'Widget renamed' }),
      { context: {} },
    );

    expect(result.name).toBe('Widget renamed');
    const updateArg = prisma.product.update.mock.calls[0]![0];
    // The SKU is immutable: the update must never carry it, so a SKU can never change once a
    // transaction references the product.
    expect(updateArg.data).not.toHaveProperty('sku');
    expect(updateArg.where).toEqual({ id: 'p1' });
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'product.update',
        entityId: 'p1',
        outcome: 'success',
      }),
    });
  });

  it('replaces the per-store thresholds wholesale on edit', async () => {
    const controller = await createController();
    prisma.product.update.mockResolvedValue(
      productRow({ stockLevels: [{ storeId: 'store-02', reorderThreshold: 9 }] }),
    );

    const result = await call(
      controller.updateProduct(admin),
      validUpdateInput({ reorderThresholds: [{ storeId: 'store-02', reorderThreshold: 9 }] }),
      { context: {} },
    );

    expect(result.reorderThresholds).toEqual([{ storeId: 'store-02', reorderThreshold: 9 }]);
    expect(prisma.product.update.mock.calls[0]![0].data.stockLevels).toEqual({
      deleteMany: {},
      create: [{ storeId: 'store-02', reorderThreshold: 9 }],
    });
  });

  it('deactivates a product (active: false) and keeps the write audited', async () => {
    const controller = await createController();
    prisma.product.update.mockResolvedValue(productRow({ active: false }));

    const result = await call(
      controller.updateProduct(admin),
      validUpdateInput({ active: false }),
      {
        context: {},
      },
    );

    expect(result.active).toBe(false);
    expect(prisma.product.update.mock.calls[0]![0].data.active).toBe(false);
  });

  it('rejects a non-administrator editing a product', async () => {
    const controller = await createController();

    const error = await call(controller.updateProduct(manager), validUpdateInput(), {
      context: {},
    }).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('ProductsController — list and deactivation visibility', () => {
  it('lists active products only by default, newest-first', async () => {
    const controller = await createController();
    prisma.product.findMany.mockResolvedValue([
      productRow({ id: 'p2', sku: 'SKU002', createdAt: new Date('2026-10-27T02:00:00.000Z') }),
      productRow({ id: 'p1', sku: 'SKU001', createdAt: new Date('2026-10-27T01:00:00.000Z') }),
    ]);
    prisma.product.count.mockResolvedValue(2);

    const result = await call(
      controller.listProducts(admin),
      { page: 1, pageSize: 20, includeInactive: false },
      { context: {} },
    );

    expect(result.items.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        include: { stockLevels: true },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('keeps a deactivated product searchable in a historical lookup (includeInactive)', async () => {
    const controller = await createController();
    prisma.product.findMany.mockResolvedValue([productRow({ active: false })]);
    prisma.product.count.mockResolvedValue(1);

    const result = await call(
      controller.listProducts(admin),
      { page: 1, pageSize: 20, includeInactive: true },
      { context: {} },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.active).toBe(false);
    // An empty where means no active filter: inactive products are returned too.
    expect(prisma.product.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('paginates the second page with the right skip/take', async () => {
    const controller = await createController();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(40);

    await call(
      controller.listProducts(admin),
      { page: 2, pageSize: 20, includeInactive: false },
      { context: {} },
    );

    expect(prisma.product.findMany.mock.calls[0]![0]).toMatchObject({ skip: 20, take: 20 });
  });

  it('rejects a non-administrator listing products with the envelope', async () => {
    const controller = await createController();

    const error = await call(
      controller.listProducts(purchasing),
      { page: 1, pageSize: 20, includeInactive: false },
      { context: {} },
    ).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expectEnvelope(error);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
