import { oc } from '@orpc/contract';
import * as z from 'zod';

/**
 * The master-data contract: stores and suppliers, the first entities every later document
 * references. It also lands the shared list behaviour every later list reuses — pagination and
 * newest-first ordering — and the audit-record shape for the first audited writes.
 *
 * Contract-first: these schemas are the single source of truth. apps/api implements the routes,
 * apps/web calls them through the typed client, and both derive types with z.infer.
 */

/** Shared list pagination input: 1-based page, bounded page size, whole numbers only. */
export const PaginationInputSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationInputSchema>;

/**
 * Wrap an item schema with the shared pagination envelope. Lists are returned newest-first;
 * `total` is the unpaginated count so the UI can render page controls.
 */
export function paginatedListSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

/** A non-empty trimmed field used for codes and names. */
const RequiredText = z.string().trim().min(1);

// --- Stores -----------------------------------------------------------------

export const StoreSchema = z.object({
  id: z.string(),
  code: RequiredText,
  name: RequiredText,
  createdAt: z.iso.datetime(),
});
export type Store = z.infer<typeof StoreSchema>;

export const StoreCreateInputSchema = z.object({
  code: RequiredText,
  name: RequiredText,
});
export type StoreCreateInput = z.infer<typeof StoreCreateInputSchema>;

export const StoreUpdateInputSchema = StoreCreateInputSchema.extend({
  id: z.string().min(1),
});
export type StoreUpdateInput = z.infer<typeof StoreUpdateInputSchema>;

export const StoreListSchema = paginatedListSchema(StoreSchema);
export type StoreList = z.infer<typeof StoreListSchema>;

// --- Suppliers --------------------------------------------------------------

export const SupplierSchema = z.object({
  id: z.string(),
  code: RequiredText,
  name: RequiredText,
  /** Free-form contact detail (phone, email, address). Optional, defaults to empty. */
  contact: z.string().default(''),
  createdAt: z.iso.datetime(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierCreateInputSchema = z.object({
  code: RequiredText,
  name: RequiredText,
  contact: z.string().default(''),
});
export type SupplierCreateInput = z.infer<typeof SupplierCreateInputSchema>;

export const SupplierUpdateInputSchema = SupplierCreateInputSchema.extend({
  id: z.string().min(1),
});
export type SupplierUpdateInput = z.infer<typeof SupplierUpdateInputSchema>;

export const SupplierListSchema = paginatedListSchema(SupplierSchema);
export type SupplierList = z.infer<typeof SupplierListSchema>;

// --- Audit ------------------------------------------------------------------

/** Whether an audited action succeeded or was refused. */
export const AuditOutcomeSchema = z.enum(['success', 'failure']);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

/**
 * An audit record for a sensitive write: who acted, on what, and how it turned out. Audit access
 * is permission-restricted (see ROLE_PERMISSIONS). Records are append-only; there is no edit route.
 */
export const AuditRecordSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string(),
  outcome: AuditOutcomeSchema,
  createdAt: z.iso.datetime(),
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

export const AuditListSchema = paginatedListSchema(AuditRecordSchema);
export type AuditList = z.infer<typeof AuditListSchema>;

// --- Routes -----------------------------------------------------------------

export const masterDataContract = {
  stores: {
    list: oc
      .route({
        method: 'GET',
        path: '/master-data/stores',
        summary: 'List stores (newest-first)',
        tags: ['Master data'],
      })
      .input(PaginationInputSchema)
      .output(StoreListSchema),
    create: oc
      .route({
        method: 'POST',
        path: '/master-data/stores',
        summary: 'Create a store',
        tags: ['Master data'],
      })
      .input(StoreCreateInputSchema)
      .output(StoreSchema),
    update: oc
      .route({
        method: 'PUT',
        path: '/master-data/stores/{id}',
        summary: 'Edit a store',
        tags: ['Master data'],
      })
      .input(StoreUpdateInputSchema)
      .output(StoreSchema),
  },
  suppliers: {
    list: oc
      .route({
        method: 'GET',
        path: '/master-data/suppliers',
        summary: 'List suppliers (newest-first)',
        tags: ['Master data'],
      })
      .input(PaginationInputSchema)
      .output(SupplierListSchema),
    create: oc
      .route({
        method: 'POST',
        path: '/master-data/suppliers',
        summary: 'Create a supplier',
        tags: ['Master data'],
      })
      .input(SupplierCreateInputSchema)
      .output(SupplierSchema),
    update: oc
      .route({
        method: 'PUT',
        path: '/master-data/suppliers/{id}',
        summary: 'Edit a supplier',
        tags: ['Master data'],
      })
      .input(SupplierUpdateInputSchema)
      .output(SupplierSchema),
  },
  audit: {
    list: oc
      .route({
        method: 'GET',
        path: '/master-data/audit',
        summary: 'List audit records (permission-restricted)',
        tags: ['Master data'],
      })
      .input(PaginationInputSchema)
      .output(AuditListSchema),
  },
};
