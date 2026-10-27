import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * Purchase order contract (PO-01, PO-03): a purchasing officer prepares draft orders to a
 * supplier, naming products, quantities, and prices. Draft orders can be edited freely. The same
 * SKU may not appear twice in one order. Document numbers are unique and assigned on creation.
 */

export const PurchaseOrderStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

/**
 * One line on a purchase order: product, ordered quantity (whole, positive), unit price (satang,
 * non-negative). A PO must have at least one line, and the same SKU may appear only once.
 */
export const PurchaseOrderLineInputSchema = z.object({
  productId: z.string().min(1),
  /** Ordered quantity: must be a positive whole number. */
  orderedQuantity: z.number().int().positive(),
  /** Purchase unit price in satang (1 THB = 100). Whole, non-negative. */
  unitPrice: z.number().int().nonnegative(),
});
export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInputSchema>;

export const PurchaseOrderLineSchema = PurchaseOrderLineInputSchema.extend({
  id: z.string(),
});
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;

/**
 * Custom refinement to reject duplicate productIds in the lines array.
 */
function noDuplicateProducts<T extends { lines: Array<{ productId: string }> }>(
  schema: z.ZodType<T>,
) {
  return schema.refine(
    (data) => {
      const productIds = data.lines.map((line) => line.productId);
      return productIds.length === new Set(productIds).size;
    },
    { message: 'The same SKU cannot appear twice in one order' },
  );
}

/**
 * Input for creating a draft purchase order: one supplier, one destination store, an expected
 * receipt date, and at least one line. Duplicate SKUs are rejected.
 */
export const PurchaseOrderCreateInputSchema = noDuplicateProducts(
  z.object({
    supplierId: z.string().min(1),
    destinationStoreId: z.string().min(1),
    expectedReceiptDate: z.iso.date(),
    lines: z.array(PurchaseOrderLineInputSchema).min(1),
  }),
);
export type PurchaseOrderCreateInput = z.infer<typeof PurchaseOrderCreateInputSchema>;

/**
 * Input for editing a draft purchase order. The entire lines array is replaced. Duplicate SKUs
 * are rejected, and at least one line is required.
 */
export const PurchaseOrderUpdateInputSchema = noDuplicateProducts(
  z.object({
    id: z.string().min(1),
    supplierId: z.string().min(1),
    destinationStoreId: z.string().min(1),
    expectedReceiptDate: z.iso.date(),
    lines: z.array(PurchaseOrderLineInputSchema).min(1),
  }),
);
export type PurchaseOrderUpdateInput = z.infer<typeof PurchaseOrderUpdateInputSchema>;

/**
 * A purchase order with its document number, status, creator, timestamps, and lines.
 */
export const PurchaseOrderSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  supplierId: z.string(),
  destinationStoreId: z.string(),
  expectedReceiptDate: z.iso.datetime(),
  status: PurchaseOrderStatusSchema,
  createdById: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(PurchaseOrderLineSchema),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const purchaseOrdersContract = {
  create: oc
    .route({
      method: 'POST',
      path: '/purchase-orders',
      summary: 'Create a draft purchase order',
      tags: ['Purchase orders'],
    })
    .input(PurchaseOrderCreateInputSchema)
    .output(PurchaseOrderSchema),
  update: oc
    .route({
      method: 'PUT',
      path: '/purchase-orders/{id}',
      summary: 'Edit a draft purchase order',
      tags: ['Purchase orders'],
    })
    .input(PurchaseOrderUpdateInputSchema)
    .output(PurchaseOrderSchema),
  get: oc
    .route({
      method: 'GET',
      path: '/purchase-orders/{id}',
      summary: 'Get one purchase order by ID',
      tags: ['Purchase orders'],
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(PurchaseOrderSchema),
};
