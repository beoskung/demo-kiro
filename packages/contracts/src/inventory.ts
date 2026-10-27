import { oc } from '@orpc/contract';
import * as z from 'zod';
import { PaginationInputSchema, paginatedListSchema } from './master-data.js';

/**
 * The inventory contract: the trustworthy, searchable stock picture (INV-01) and the shape of the
 * immutable movement ledger (INV-02) every stock write depends on. It is the single source of
 * truth: apps/api implements the routes, apps/web calls them through the typed client, and both
 * derive types with z.infer.
 *
 * The rules the spec fixes live here:
 * - Stock is searchable by SKU, product name, and store, returning the current quantity, unit,
 *   reorder threshold, and a low-stock flag (quantity ≤ the store's threshold).
 * - Zero-stock products stay visible, so a row with quantity 0 is a normal, low-stock result.
 * - Quantities are whole and non-negative; a balance may reach 0 but never goes negative.
 */

/** A whole, non-negative amount: a stock quantity or a reorder threshold. */
const NonNegativeInt = z.number().int().nonnegative();

// --- Movement type ----------------------------------------------------------

/**
 * The kinds of stock movement the ledger records: a RECEIPT increases stock, a SALE decreases it,
 * and an ADJUSTMENT is a manual manager correction in either direction. Mirrors the Prisma
 * `MovementType` enum; it is the single source of truth for the set.
 */
export const MovementTypeSchema = z.enum(['RECEIPT', 'SALE', 'ADJUSTMENT']);
export type MovementType = z.infer<typeof MovementTypeSchema>;

// --- Stock search -----------------------------------------------------------

/**
 * Search stock. `query` matches SKU or product name (case-insensitive, substring); a blank query
 * is treated as no filter. `storeId` narrows to one store. Both are optional, so an empty search
 * returns every stock row. Extends the shared pagination (1-based page, bounded size, newest-first).
 */
export const StockSearchInputSchema = PaginationInputSchema.extend({
  /** Free-text match against SKU or product name. Trimmed; a blank value is no filter. */
  query: z.string().trim().optional(),
  /** Narrow the search to a single store. Absent means every store. */
  storeId: z.string().min(1).optional(),
});
export type StockSearchInput = z.infer<typeof StockSearchInputSchema>;

/**
 * One stock row: the current balance for a product at a store, with the unit and reorder threshold
 * the UI needs, plus a derived `lowStock` flag (true when quantity ≤ the store's threshold). A
 * zero-stock row is returned normally and is flagged low-stock, so gaps stay visible (RPT-02).
 */
export const StockRowSchema = z.object({
  productId: z.string(),
  sku: z.string(),
  productName: z.string(),
  storeId: z.string(),
  /** Current on-hand balance. Whole, non-negative; may be 0. */
  quantity: NonNegativeInt,
  unit: z.string(),
  /** The store's reorder threshold for this product. Whole, non-negative. */
  reorderThreshold: NonNegativeInt,
  /** True when quantity ≤ reorderThreshold (the store should restock). */
  lowStock: z.boolean(),
});
export type StockRow = z.infer<typeof StockRowSchema>;

export const StockSearchResultSchema = paginatedListSchema(StockRowSchema);
export type StockSearchResult = z.infer<typeof StockSearchResultSchema>;

// --- Routes -----------------------------------------------------------------

export const inventoryContract = {
  search: oc
    .route({
      method: 'GET',
      path: '/inventory/stock',
      summary: 'Search stock by SKU, product name, and store (zero-stock rows stay visible)',
      tags: ['Inventory'],
    })
    .input(StockSearchInputSchema)
    .output(StockSearchResultSchema),
};
