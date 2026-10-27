import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { makeUser } from '../auth/test-user.js';
import { InventoryController } from './inventory.controller.js';

type PrismaStub = {
  stockLevel: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  store: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const storeEmployee = makeUser('STORE_EMPLOYEE', { id: 'emp-1' });
const manager = makeUser('MANAGER', { id: 'mgr-1' });

/** A StockLevel row joined with its product, as Prisma returns it to the handler. */
function stockLevelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sl1',
    productId: 'p1',
    storeId: 'store-b01',
    quantity: 10,
    reorderThreshold: 3,
    product: { sku: 'SKU001', name: 'Drinking water pack of 6', unit: 'packs' },
    ...overrides,
  };
}

let prisma: PrismaStub;

async function createController() {
  prisma = {
    stockLevel: { findMany: vi.fn(), count: vi.fn() },
    // A free-text query resolves matching store codes/names to ids; default to no store match.
    store: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [InventoryController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(InventoryController);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InventoryController — stock search', () => {
  it('returns current quantity, unit, reorder threshold and a low-stock flag', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([stockLevelRow()]);
    prisma.stockLevel.count.mockResolvedValue(1);

    const result = await call(
      controller.search(storeEmployee),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items).toEqual([
      {
        productId: 'p1',
        sku: 'SKU001',
        productName: 'Drinking water pack of 6',
        storeId: 'store-b01',
        quantity: 10,
        unit: 'packs',
        reorderThreshold: 3,
        lowStock: false,
      },
    ]);
    expect(result.total).toBe(1);
  });

  it('flags a row as low stock when quantity is at or below the threshold', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([
      stockLevelRow({ quantity: 3, reorderThreshold: 3 }), // equal → low
      stockLevelRow({ id: 'sl2', productId: 'p2', quantity: 2, reorderThreshold: 3 }), // below → low
    ]);
    prisma.stockLevel.count.mockResolvedValue(2);

    const result = await call(
      controller.search(manager),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items.map((r) => r.lowStock)).toEqual([true, true]);
  });

  it('keeps a zero-stock product visible and flags it low stock', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([
      stockLevelRow({
        productId: 'p3',
        quantity: 0,
        reorderThreshold: 3,
        product: { sku: 'SKU003', name: 'Laundry detergent', unit: 'bags' },
      }),
    ]);
    prisma.stockLevel.count.mockResolvedValue(1);

    const result = await call(
      controller.search(manager),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ sku: 'SKU003', quantity: 0, lowStock: true });
  });

  it('filters by store when a storeId is given', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([]);
    prisma.stockLevel.count.mockResolvedValue(0);

    await call(
      controller.search(manager),
      { page: 1, pageSize: 20, storeId: 'store-b02' },
      { context: {} },
    );

    expect(prisma.stockLevel.findMany.mock.calls[0]![0].where).toMatchObject({
      storeId: 'store-b02',
    });
  });

  it('matches SKU, product name, or store for a free-text query (case-insensitive)', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([]);
    prisma.stockLevel.count.mockResolvedValue(0);
    prisma.store.findMany.mockResolvedValue([]); // no store code/name matches "water"

    await call(
      controller.search(manager),
      { page: 1, pageSize: 20, query: 'water' },
      { context: {} },
    );

    const where = prisma.stockLevel.findMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual([
      { product: { sku: { contains: 'water', mode: 'insensitive' } } },
      { product: { name: { contains: 'water', mode: 'insensitive' } } },
      { storeId: { in: [] } },
    ]);
    // The store lookup matched code or name, case-insensitive.
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { code: { contains: 'water', mode: 'insensitive' } },
            { name: { contains: 'water', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      }),
    );
  });

  it('searches by store code (e.g. B01), resolving the code to its store id', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([stockLevelRow()]);
    prisma.stockLevel.count.mockResolvedValue(1);
    prisma.store.findMany.mockResolvedValue([{ id: 'store-b01' }]);

    const result = await call(
      controller.search(manager),
      { page: 1, pageSize: 20, query: 'B01' },
      { context: {} },
    );

    const where = prisma.stockLevel.findMany.mock.calls[0]![0].where;
    // The resolved store id is OR'd in, so a search for "B01" returns that store's stock.
    expect(where.OR).toContainEqual({ storeId: { in: ['store-b01'] } });
    expect(result.items).toHaveLength(1);
  });

  it('ignores a blank query (no filter)', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([]);
    prisma.stockLevel.count.mockResolvedValue(0);

    await call(
      controller.search(manager),
      { page: 1, pageSize: 20, query: '   ' },
      { context: {} },
    );

    const where = prisma.stockLevel.findMany.mock.calls[0]![0].where;
    expect(where.OR).toBeUndefined();
    // A blank query must not trigger a store lookup either.
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('paginates with the right skip/take and orders newest-first', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([]);
    prisma.stockLevel.count.mockResolvedValue(40);

    await call(controller.search(manager), { page: 2, pageSize: 20 }, { context: {} });

    expect(prisma.stockLevel.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 20,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('allows any role holding report:view to search stock', async () => {
    const controller = await createController();
    prisma.stockLevel.findMany.mockResolvedValue([]);
    prisma.stockLevel.count.mockResolvedValue(0);

    // Every TOR role holds report:view, so each may view stock. A store employee is the most
    // restricted role, so proving it is accepted proves the permission gate lets authorized roles
    // through. The role/store matrix is covered exhaustively in the permission specs.
    const result = await call(
      controller.search(storeEmployee),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items).toEqual([]);
    expect(prisma.stockLevel.findMany).toHaveBeenCalledTimes(1);
  });
});
