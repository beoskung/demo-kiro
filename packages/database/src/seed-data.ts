import type { PrismaClient } from './generated/prisma/client.js';

/**
 * The §8.1 "starting data for each scenario" from the TOR, in one place so the demo seed and the
 * integration harness agree on exactly the same fixture. Both reset to this before a scenario so
 * no scenario depends on the outcome of another.
 *
 * Stores B01 and B02, supplier SUP01, and products SKU001–SKU003. All B01 opening balances are as
 * tabled; every B02 balance is zero. Every product has a reorder threshold of 3 at both stores.
 * Selling prices are whole satang (THB × 100).
 */

/** A store in the starting data. Ids are fixed so stock levels can reference them deterministically. */
export const SCENARIO_STORES = [
  { id: 'store-b01', code: 'B01', name: 'Central Store' },
  { id: 'store-b02', code: 'B02', name: 'Riverside Store' },
] as const;

/** The single supplier in the starting data. */
export const SCENARIO_SUPPLIERS = [
  { id: 'supplier-sup01', code: 'SUP01', name: 'SupplyOne Co Ltd', contact: '' },
] as const;

/** The reorder threshold every product carries at every store in the starting data. */
export const SCENARIO_REORDER_THRESHOLD = 3;

/**
 * The products in the starting data with their B01 opening balance. B02 balances are all zero.
 * `sellingPrice` is in satang. `unit` matches the TOR wording (packs / bags).
 */
export const SCENARIO_PRODUCTS = [
  {
    id: 'product-sku001',
    sku: 'SKU001',
    name: 'Drinking water pack of 6',
    category: 'Beverage',
    unit: 'packs',
    sellingPrice: 6000,
    b01Quantity: 10,
  },
  {
    id: 'product-sku002',
    sku: 'SKU002',
    name: 'Tissue paper',
    category: 'Household',
    unit: 'packs',
    sellingPrice: 3500,
    b01Quantity: 5,
  },
  {
    id: 'product-sku003',
    sku: 'SKU003',
    name: 'Laundry detergent',
    category: 'Household',
    unit: 'bags',
    sellingPrice: 12000,
    b01Quantity: 0,
  },
] as const;

/** Clear the transactional tables, then every scenario entity, so a reset starts from empty. */
async function clearScenarioData(prisma: PrismaClient): Promise<void> {
  // Order matters: movements and stock levels reference products; clear them first.
  await prisma.stockMovement.deleteMany({});
  await prisma.documentSequence.deleteMany({});
  await prisma.stockLevel.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.store.deleteMany({});
}

/**
 * Reset the database to the §8.1 starting data. Idempotent: it clears the scenario tables and
 * recreates stores, the supplier, products, and per-store stock levels (B01 opening balances, B02
 * zero), each product with a reorder threshold of 3 at both stores. Used by the demo seed and by
 * the integration harness between scenarios.
 */
export async function seedScenarioData(prisma: PrismaClient): Promise<void> {
  await clearScenarioData(prisma);

  for (const store of SCENARIO_STORES) {
    await prisma.store.create({ data: { id: store.id, code: store.code, name: store.name } });
  }

  for (const supplier of SCENARIO_SUPPLIERS) {
    await prisma.supplier.create({
      data: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        contact: supplier.contact,
      },
    });
  }

  for (const product of SCENARIO_PRODUCTS) {
    await prisma.product.create({
      data: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        unit: product.unit,
        sellingPrice: product.sellingPrice,
        active: true,
        stockLevels: {
          create: [
            {
              storeId: 'store-b01',
              quantity: product.b01Quantity,
              reorderThreshold: SCENARIO_REORDER_THRESHOLD,
            },
            {
              storeId: 'store-b02',
              quantity: 0,
              reorderThreshold: SCENARIO_REORDER_THRESHOLD,
            },
          ],
        },
      },
    });
  }
}
