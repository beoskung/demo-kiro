import { Controller } from '@nestjs/common';
import {
  type AuditOutcome,
  type ProductListInput,
  type ReorderThreshold,
  type User,
  contract,
} from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { apiError } from '../auth/api-error.js';
import { ensurePermission } from '../auth/permission.js';
import { PrismaService } from '../database/prisma.service.js';

/** A per-store stock level row as Prisma returns it (the parts the catalogue cares about). */
type StockLevelRow = { storeId: string; reorderThreshold: number };

/** A product row with its stock levels joined, as the handlers read it from Prisma. */
type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  sellingPrice: number;
  active: boolean;
  referenced: boolean;
  createdAt: Date;
  stockLevels?: StockLevelRow[];
};

/** Prisma's unique-constraint violation code, raised when a duplicate SKU is inserted. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code: unknown }).code === PRISMA_UNIQUE_VIOLATION
    : false;
}

/** Map a product row (with joined stock levels) to the contract's product shape. */
function toProduct(row: ProductRow) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    sellingPrice: row.sellingPrice,
    active: row.active,
    reorderThresholds: (row.stockLevels ?? []).map((level) => ({
      storeId: level.storeId,
      reorderThreshold: level.reorderThreshold,
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Turn a 1-based page + size into Prisma's skip/take. */
function paginate({ page, pageSize }: Pick<ProductListInput, 'page' | 'pageSize'>) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Build the nested StockLevel create payload from the contract's per-store thresholds. */
function stockLevelCreates(thresholds: ReorderThreshold[]) {
  return thresholds.map((t) => ({ storeId: t.storeId, reorderThreshold: t.reorderThreshold }));
}

/**
 * Products master data. Writes are restricted to an ADMINISTRATOR both at the guard (`@Roles`) and
 * in the handler (`ensurePermission('master-data:manage')`) — role is enforced at the API, never
 * by hiding UI alone. Each successful write appends an audit record; a refused write is audited as
 * a failure. The rules the spec fixes (MD-01, MD-02) are enforced here:
 *
 * - SKU is unique: a duplicate is rejected with a CONFLICT envelope (retry category).
 * - SKU is immutable: the update input has no SKU field, so a SKU can never be changed once a
 *   transaction references the product.
 * - Selling price, reorder threshold, and quantity bounds are validated by the contract.
 * - A deactivated product stays searchable in a historical lookup (`includeInactive: true`) but is
 *   hidden from the default catalogue, so it cannot be picked when building a new document.
 */
@Controller()
@Roles('ADMINISTRATOR')
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  private async recordAudit(
    actorId: string,
    action: string,
    entityId: string,
    outcome: AuditOutcome,
  ) {
    await this.prisma.auditRecord.create({
      data: { actorId, action, entity: 'product', entityId, outcome },
    });
  }

  /**
   * Run an audited write: execute `write`, then append an audit record capturing the outcome. A
   * success is audited with the product's id; a failure is audited as `failure` and the original
   * error is rethrown after being mapped to the shared envelope (a duplicate SKU becomes CONFLICT).
   */
  private async auditedWrite<T extends { id: string }>(
    actorId: string,
    action: string,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await write();
      await this.recordAudit(actorId, action, result.id, 'success');
      return result;
    } catch (error) {
      await this.recordAudit(actorId, action, '', 'failure');
      if (isUniqueViolation(error)) {
        throw apiError('CONFLICT', 'รหัสสินค้า (SKU) นี้มีอยู่แล้ว');
      }
      throw error;
    }
  }

  @Implement(contract.products.create)
  createProduct(@CurrentUser() user: User) {
    return implement(contract.products.create).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const product = await this.auditedWrite(
        user.id,
        'product.create',
        () =>
          this.prisma.product.create({
            data: {
              sku: input.sku,
              name: input.name,
              category: input.category,
              unit: input.unit,
              sellingPrice: input.sellingPrice,
              active: input.active,
              stockLevels: { create: stockLevelCreates(input.reorderThresholds) },
            },
            include: { stockLevels: true },
          }) as Promise<ProductRow>,
      );
      return toProduct(product);
    });
  }

  @Implement(contract.products.update)
  updateProduct(@CurrentUser() user: User) {
    return implement(contract.products.update).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const product = await this.auditedWrite(
        user.id,
        'product.update',
        () =>
          // The SKU is deliberately absent from `data`: it is immutable once a transaction
          // references the product, so the edit never touches it. Per-store thresholds are
          // replaced wholesale (delete then recreate) to keep the set in sync with the input.
          this.prisma.product.update({
            where: { id: input.id },
            data: {
              name: input.name,
              category: input.category,
              unit: input.unit,
              sellingPrice: input.sellingPrice,
              active: input.active,
              stockLevels: {
                deleteMany: {},
                create: stockLevelCreates(input.reorderThresholds),
              },
            },
            include: { stockLevels: true },
          }) as Promise<ProductRow>,
      );
      return toProduct(product);
    });
  }

  @Implement(contract.products.list)
  listProducts(@CurrentUser() user: User) {
    return implement(contract.products.list).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      // A normal catalogue lookup returns active products only, so a deactivated product can never
      // be picked for a new document. A historical lookup (`includeInactive`) also returns inactive
      // products, so they stay searchable in past records.
      const where = input.includeInactive ? {} : { active: true };
      const [rows, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: { stockLevels: true },
          ...paginate(input),
        }),
        this.prisma.product.count({ where }),
      ]);
      return {
        items: (rows as ProductRow[]).map(toProduct),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }
}
