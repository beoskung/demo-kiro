import { oc } from '@orpc/contract';
import * as z from 'zod';
import { PaginationInputSchema, paginatedListSchema } from './master-data.js';

/**
 * The products contract: the catalogue that purchasing, receiving, sales, and reporting all
 * depend on. A product has a unique SKU, a name, category, unit, a non-negative whole selling
 * price (in satang, the smallest currency unit), an active flag, and a reorder threshold defined
 * per store. The rules the spec fixes (MD-01, MD-02) live here as the single source of truth:
 *
 * - SKU is unique across the organization and immutable once a transaction references the product.
 * - Selling price and reorder threshold are never negative; stock quantities are whole numbers.
 * - A product can be deactivated: it stays searchable in historical lookups but may not be added
 *   to a new document.
 *
 * Contract-first: apps/api implements the routes, apps/web calls them through the typed client,
 * and both derive types with z.infer.
 */

/** A non-empty trimmed field used for SKUs, names, categories, and units. */
const RequiredText = z.string().trim().min(1);

/** A whole, non-negative amount: selling price (satang), reorder threshold, and stock quantity. */
const NonNegativeInt = z.number().int().nonnegative();

// --- Per-store reorder threshold -------------------------------------------

/**
 * A reorder threshold for a product at one store. The threshold is whole and non-negative; the
 * store it belongs to is identified by `storeId`. A product carries at most one threshold per
 * store (enforced by the unique (product, store) pair in the database).
 */
export const ReorderThresholdSchema = z.object({
  storeId: RequiredText,
  reorderThreshold: NonNegativeInt,
});
export type ReorderThreshold = z.infer<typeof ReorderThresholdSchema>;

// --- Product ----------------------------------------------------------------

export const ProductSchema = z.object({
  id: z.string(),
  sku: RequiredText,
  name: RequiredText,
  category: RequiredText,
  unit: RequiredText,
  /** Selling price in satang (1 THB = 100). Whole, non-negative. */
  sellingPrice: NonNegativeInt,
  /** Whether the product may be added to a new document. Inactive products stay searchable. */
  active: z.boolean(),
  /** Per-store reorder thresholds. Empty when no store has set one yet. */
  reorderThresholds: z.array(ReorderThresholdSchema).default([]),
  createdAt: z.iso.datetime(),
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Create a product. SKU, name, category, and unit are required; selling price is whole and
 * non-negative; `active` defaults to true. Per-store reorder thresholds are optional at creation.
 */
export const ProductCreateInputSchema = z.object({
  sku: RequiredText,
  name: RequiredText,
  category: RequiredText,
  unit: RequiredText,
  sellingPrice: NonNegativeInt,
  active: z.boolean().default(true),
  reorderThresholds: z.array(ReorderThresholdSchema).default([]),
});
export type ProductCreateInput = z.infer<typeof ProductCreateInputSchema>;

/**
 * Edit a product. The SKU is deliberately omitted: it is immutable once a transaction references
 * the product, and the API is the single place that decides whether a change is allowed. The
 * editable fields mirror the create input; the id selects the product.
 */
export const ProductUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: RequiredText,
  category: RequiredText,
  unit: RequiredText,
  sellingPrice: NonNegativeInt,
  active: z.boolean(),
  reorderThresholds: z.array(ReorderThresholdSchema).default([]),
});
export type ProductUpdateInput = z.infer<typeof ProductUpdateInputSchema>;

/**
 * List products. Extends the shared pagination with an optional `includeInactive` flag: a normal
 * lookup returns active products only, while a historical lookup (`includeInactive: true`) also
 * returns deactivated ones so they stay searchable.
 */
export const ProductListInputSchema = PaginationInputSchema.extend({
  includeInactive: z.boolean().default(false),
});
export type ProductListInput = z.infer<typeof ProductListInputSchema>;

export const ProductListSchema = paginatedListSchema(ProductSchema);
export type ProductList = z.infer<typeof ProductListSchema>;

// --- Routes -----------------------------------------------------------------

export const productsContract = {
  list: oc
    .route({
      method: 'GET',
      path: '/products',
      summary: 'List products (newest-first; active only unless includeInactive)',
      tags: ['Products'],
    })
    .input(ProductListInputSchema)
    .output(ProductListSchema),
  create: oc
    .route({
      method: 'POST',
      path: '/products',
      summary: 'Create a product',
      tags: ['Products'],
    })
    .input(ProductCreateInputSchema)
    .output(ProductSchema),
  update: oc
    .route({
      method: 'PUT',
      path: '/products/{id}',
      summary: 'Edit a product (SKU is immutable once referenced)',
      tags: ['Products'],
    })
    .input(ProductUpdateInputSchema)
    .output(ProductSchema),
};
