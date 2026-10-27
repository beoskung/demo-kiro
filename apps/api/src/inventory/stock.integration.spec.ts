import { type PrismaClient, createPrismaClient, seedScenarioData } from '@erp/database';
import type { MovementType } from '@erp/contracts';
import { call } from '@orpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { makeUser } from '../auth/test-user.js';
import { nextDocumentNumber } from './document-number.service.js';
import { InventoryController } from './inventory.controller.js';

/**
 * The Postgres integration harness (the one new testing seam for ticket #5). Unlike the controller
 * specs — which stub Prisma — this drives the **real** handler and **real** Prisma against the
 * Dockerized Postgres, and resets to the §8.1 starting data before every scenario so no scenario
 * depends on another. It is reserved for behaviour a stub cannot prove: the stored balance equals
 * opening plus movements and never goes negative (INV-03), every movement row records the full
 * audit shape (INV-02), and the document-number generator is genuinely unique under repeated calls.
 *
 * It only runs when a database is reachable (`DATABASE_URL` set). Under the plain unit-test run in
 * CI's `check` job — which has no Postgres — the whole suite is skipped, so it never goes red there.
 * Run it against Postgres with `DATABASE_URL=... pnpm --filter @erp/api exec vitest run src/inventory/stock.integration.spec.ts`.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const manager = makeUser('MANAGER', { id: 'mgr-1' });

/**
 * Post a stock movement the way a receipt/sale/adjustment ticket will: inside one interactive
 * transaction, re-read the authoritative balance with a row lock, validate it never goes negative,
 * then write the StockLevel balance and the StockMovement ledger row together. This is the posting
 * primitive ticket #5 stands up; later tickets call the same shape from their own handlers.
 */
async function postMovement(
  prisma: PrismaClient,
  args: {
    productId: string;
    storeId: string;
    delta: number;
    type: MovementType;
    sourceDocument: string;
    actorId: string;
  },
): Promise<{ balanceAfter: number }> {
  return prisma.$transaction(async (tx) => {
    // Lock the balance row for this (product, store) so concurrent posts serialise.
    const locked = await tx.$queryRaw<Array<{ id: string; quantity: number }>>`
      SELECT "id", "quantity" FROM "StockLevel"
      WHERE "productId" = ${args.productId} AND "storeId" = ${args.storeId}
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new Error('no stock level for (product, store)');
    }
    const balanceBefore = row.quantity;
    const balanceAfter = balanceBefore + args.delta;
    if (balanceAfter < 0) {
      // Balance may reach 0 but never goes negative (INV-03).
      throw new Error('insufficient stock');
    }
    await tx.stockLevel.update({ where: { id: row.id }, data: { quantity: balanceAfter } });
    await tx.stockMovement.create({
      data: {
        productId: args.productId,
        storeId: args.storeId,
        delta: args.delta,
        balanceBefore,
        balanceAfter,
        type: args.type,
        sourceDocument: args.sourceDocument,
        actorId: args.actorId,
      },
    });
    return { balanceAfter };
  });
}

describe.skipIf(!DATABASE_URL)('Inventory — Postgres integration harness', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL!);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Reset to the §8.1 starting data before every scenario.
  beforeEach(async () => {
    await seedScenarioData(prisma);
  });

  it('resets to the §8.1 starting data between scenarios', async () => {
    const stores = await prisma.store.findMany({ orderBy: { code: 'asc' } });
    expect(stores.map((s) => s.code)).toEqual(['B01', 'B02']);

    const b01 = await prisma.stockLevel.findMany({
      where: { storeId: 'store-b01' },
      include: { product: true },
      orderBy: { product: { sku: 'asc' } },
    });
    expect(b01.map((l) => [l.product.sku, l.quantity])).toEqual([
      ['SKU001', 10],
      ['SKU002', 5],
      ['SKU003', 0],
    ]);
    // Every B02 balance is zero.
    const b02 = await prisma.stockLevel.findMany({ where: { storeId: 'store-b02' } });
    expect(b02.every((l) => l.quantity === 0)).toBe(true);
    // A leftover movement from a previous scenario must not survive the reset.
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('search() returns the §8.1 picture with the low-stock flag, zero-stock visible', async () => {
    // The real client satisfies the only Prisma surface the controller uses (stockLevel). The cast
    // bridges the Nest-provider type (`PrismaService`) the constructor declares, without a DI setup.
    const controller = new InventoryController(prisma as unknown as PrismaService);

    const result = await call(
      controller.search(manager),
      { page: 1, pageSize: 100, storeId: 'store-b01' },
      { context: {} },
    );

    const bySku = new Map(result.items.map((r) => [r.sku, r]));
    expect(bySku.get('SKU001')).toMatchObject({ quantity: 10, lowStock: false, unit: 'packs' });
    expect(bySku.get('SKU002')).toMatchObject({ quantity: 5, lowStock: false });
    // SKU003 has balance 0 ≤ threshold 3: visible and flagged low stock (AC-08).
    expect(bySku.get('SKU003')).toMatchObject({ quantity: 0, lowStock: true });
  });

  it('keeps the stored balance equal to opening plus successful movements', async () => {
    // Opening SKU001@B01 = 10. Receive 8, sell 3 → 15.
    await postMovement(prisma, {
      productId: 'product-sku001',
      storeId: 'store-b01',
      delta: 8,
      type: 'RECEIPT',
      sourceDocument: 'GR-00001',
      actorId: 'mgr-1',
    });
    await postMovement(prisma, {
      productId: 'product-sku001',
      storeId: 'store-b01',
      delta: -3,
      type: 'SALE',
      sourceDocument: 'SA-00001',
      actorId: 'mgr-1',
    });

    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku001', storeId: 'store-b01' },
    });
    expect(level!.quantity).toBe(15);

    const movements = await prisma.stockMovement.findMany({
      where: { productId: 'product-sku001', storeId: 'store-b01' },
      orderBy: { createdAt: 'asc' },
    });
    // Every movement records the full audit shape with matching before/after balances.
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      delta: 8,
      balanceBefore: 10,
      balanceAfter: 18,
      type: 'RECEIPT',
      sourceDocument: 'GR-00001',
      actorId: 'mgr-1',
    });
    expect(movements[1]).toMatchObject({
      delta: -3,
      balanceBefore: 18,
      balanceAfter: 15,
      type: 'SALE',
    });
    for (const m of movements) {
      expect(m.balanceAfter).toBe(m.balanceBefore + m.delta);
      expect(m.balanceAfter).toBeGreaterThanOrEqual(0);
      expect(m.createdAt).toBeInstanceOf(Date);
    }
  });

  it('never drives the balance negative and writes no movement when a post is rejected', async () => {
    // SKU002@B01 opens at 5. Selling 6 must be refused and leave stock + ledger untouched.
    await expect(
      postMovement(prisma, {
        productId: 'product-sku002',
        storeId: 'store-b01',
        delta: -6,
        type: 'SALE',
        sourceDocument: 'SA-00002',
        actorId: 'mgr-1',
      }),
    ).rejects.toThrow(/insufficient/);

    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku002', storeId: 'store-b01' },
    });
    expect(level!.quantity).toBe(5); // unchanged
    expect(await prisma.stockMovement.count()).toBe(0); // rolled back together
  });

  it('lets the balance reach exactly zero', async () => {
    await postMovement(prisma, {
      productId: 'product-sku002',
      storeId: 'store-b01',
      delta: -5,
      type: 'SALE',
      sourceDocument: 'SA-00003',
      actorId: 'mgr-1',
    });
    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku002', storeId: 'store-b01' },
    });
    expect(level!.quantity).toBe(0);
  });

  it('mints unique document numbers under repeated calls', async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 25; i++) {
      numbers.add(await nextDocumentNumber(prisma, 'GR'));
    }
    expect(numbers.size).toBe(25);
    expect(numbers.has('GR-00001')).toBe(true);
    expect(numbers.has('GR-00025')).toBe(true);
  });

  it('mints unique document numbers under concurrent calls', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextDocumentNumber(prisma, 'SA')),
    );
    // The atomic increment guarantees no two concurrent callers get the same number.
    expect(new Set(results).size).toBe(20);
  });

  it('adjust() increases stock with a mandatory reason and audits with actor and timestamp', async () => {
    const controller = new InventoryController(prisma as unknown as PrismaService);

    const result = await call(
      controller.adjust(manager),
      {
        productId: 'product-sku002',
        storeId: 'store-b01',
        delta: 8,
        reason: 'Physical count correction',
      },
      { context: {} },
    );

    expect(result).toMatchObject({
      balanceBefore: 5,
      balanceAfter: 13,
      delta: 8,
    });
    expect(result.documentNumber).toMatch(/^ADJ-\d{5}$/);

    // The balance is updated
    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku002', storeId: 'store-b01' },
    });
    expect(level!.quantity).toBe(13);

    // The ledger records the full audit trail
    const movement = await prisma.stockMovement.findFirst({
      where: { productId: 'product-sku002', storeId: 'store-b01', type: 'ADJUSTMENT' },
    });
    expect(movement).toMatchObject({
      delta: 8,
      balanceBefore: 5,
      balanceAfter: 13,
      type: 'ADJUSTMENT',
      sourceDocument: result.documentNumber,
      actorId: 'mgr-1',
    });
    expect(movement!.createdAt).toBeInstanceOf(Date);

    // The adjustment is audited
    const audit = await prisma.auditRecord.findFirst({
      where: { action: 'stock.adjust', outcome: 'success' },
    });
    expect(audit).toMatchObject({
      actorId: 'mgr-1',
      action: 'stock.adjust',
      entity: 'stock',
      entityId: 'product-sku002:store-b01',
      outcome: 'success',
    });
    expect(audit!.createdAt).toBeInstanceOf(Date);
  });

  it('adjust() decreases stock with a reason and the ledger shows the signed delta', async () => {
    const controller = new InventoryController(prisma as unknown as PrismaService);

    const result = await call(
      controller.adjust(manager),
      {
        productId: 'product-sku001',
        storeId: 'store-b01',
        delta: -3,
        reason: 'Damaged goods writeoff',
      },
      { context: {} },
    );

    expect(result).toMatchObject({
      balanceBefore: 10,
      balanceAfter: 7,
      delta: -3,
    });

    const movement = await prisma.stockMovement.findFirst({
      where: { productId: 'product-sku001', storeId: 'store-b01', type: 'ADJUSTMENT' },
    });
    expect(movement).toMatchObject({
      delta: -3,
      balanceBefore: 10,
      balanceAfter: 7,
      type: 'ADJUSTMENT',
    });
  });

  it('adjust() rejects a decrease larger than the available balance and audits the failure', async () => {
    const controller = new InventoryController(prisma as unknown as PrismaService);

    // SKU002@B01 has balance 5; attempting -6 must be rejected
    const promise = call(
      controller.adjust(manager),
      {
        productId: 'product-sku002',
        storeId: 'store-b01',
        delta: -6,
        reason: 'Attempted over-adjustment',
      },
      { context: {} },
    );

    await expect(promise).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('ไม่เพียงพอ'),
    });

    // The balance is unchanged
    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku002', storeId: 'store-b01' },
    });
    expect(level!.quantity).toBe(5);

    // No movement was written (rolled back)
    const movements = await prisma.stockMovement.count();
    expect(movements).toBe(0);

    // The failure is audited
    const audit = await prisma.auditRecord.findFirst({
      where: { action: 'stock.adjust', outcome: 'failure' },
    });
    expect(audit).toMatchObject({
      actorId: 'mgr-1',
      action: 'stock.adjust',
      entity: 'stock',
      entityId: '',
      outcome: 'failure',
    });
  });

  it('adjust() creates the stock level row when it does not exist (first stock at a new store)', async () => {
    const controller = new InventoryController(prisma as unknown as PrismaService);

    // SKU001@B02 has a row with quantity 0; delete it to simulate a product never seen at B02 yet
    await prisma.stockLevel.deleteMany({
      where: { productId: 'product-sku001', storeId: 'store-b02' },
    });

    const result = await call(
      controller.adjust(manager),
      {
        productId: 'product-sku001',
        storeId: 'store-b02',
        delta: 20,
        reason: 'Initial stock at new branch',
      },
      { context: {} },
    );

    expect(result).toMatchObject({
      balanceBefore: 0,
      balanceAfter: 20,
      delta: 20,
    });

    const level = await prisma.stockLevel.findFirst({
      where: { productId: 'product-sku001', storeId: 'store-b02' },
    });
    expect(level).toMatchObject({
      productId: 'product-sku001',
      storeId: 'store-b02',
      quantity: 20,
      reorderThreshold: 0,
    });
  });
});
