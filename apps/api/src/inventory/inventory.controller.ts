import { Controller } from '@nestjs/common';
import {
  type AuditOutcome,
  type StockSearchInput,
  type User,
  contract,
} from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { ORPCError } from '@orpc/server';
import { CurrentUser } from '../auth/auth.decorators.js';
import { apiError } from '../auth/api-error.js';
import { ensurePermission } from '../auth/permission.js';
import { PrismaService } from '../database/prisma.service.js';
import { nextDocumentNumber } from './document-number.service.js';

/** A StockLevel row joined with the parts of its product the stock view needs. */
type StockLevelRow = {
  productId: string;
  storeId: string;
  quantity: number;
  reorderThreshold: number;
  product: { sku: string; name: string; unit: string };
};

/** The Prisma `where` a stock search resolves to. */
type StockLevelWhere = {
  storeId?: string | { in: string[] };
  OR?: Array<Record<string, unknown>>;
};

/** Turn a 1-based page + size into Prisma's skip/take. */
function paginate({ page, pageSize }: Pick<StockSearchInput, 'page' | 'pageSize'>) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Map a joined StockLevel row to the contract's stock row, deriving the low-stock flag. A product
 * is low on stock when its balance is at or below the store's reorder threshold; a zero balance is
 * therefore always low-stock and stays visible in the results (RPT-02).
 */
function toStockRow(row: StockLevelRow) {
  return {
    productId: row.productId,
    sku: row.product.sku,
    productName: row.product.name,
    storeId: row.storeId,
    quantity: row.quantity,
    unit: row.product.unit,
    reorderThreshold: row.reorderThreshold,
    lowStock: row.quantity <= row.reorderThreshold,
  };
}

/**
 * Inventory: the searchable stock picture (INV-01). The running balance lives in `StockLevel`
 * (one row per product × store); this controller reads it joined with the product for the SKU,
 * name, and unit, and derives the low-stock flag. Reading stock needs the `report:view`
 * permission, which every TOR role holds — role is still enforced at the API, never by hiding UI.
 */
@Controller()
export class InventoryController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the store ids whose code or name matches a free-text query, so a user can search by a
   * human store code (e.g. "B01") and not only by the opaque store id. Returns an empty array when
   * nothing matches, which the caller turns into a "no store matched" filter.
   */
  private async storeIdsMatching(query: string): Promise<string[]> {
    const stores = await this.prisma.store.findMany({
      where: {
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }

  /**
   * Build the Prisma `where` for a stock search. A `storeId` narrows to one store. A non-blank
   * `query` matches the SKU or product name, *or* a store whose code/name matches — so stock can be
   * searched by SKU, product name, and store (INV-01, the demo's "search across B01 and B02"). A
   * blank query adds no filter, so an empty search returns every stock row (zero-stock included).
   */
  private async buildWhere(input: StockSearchInput): Promise<StockLevelWhere> {
    const where: StockLevelWhere = {};
    if (input.storeId) {
      where.storeId = input.storeId;
    }
    const query = input.query?.trim();
    if (query) {
      const matchedStoreIds = await this.storeIdsMatching(query);
      where.OR = [
        { product: { sku: { contains: query, mode: 'insensitive' } } },
        { product: { name: { contains: query, mode: 'insensitive' } } },
        { storeId: { in: matchedStoreIds } },
      ];
    }
    return where;
  }

  @Implement(contract.inventory.search)
  search(@CurrentUser() user: User) {
    return implement(contract.inventory.search).handler(async ({ input }) => {
      ensurePermission(user, 'report:view');
      const where = await this.buildWhere(input);
      const [rows, total] = await Promise.all([
        this.prisma.stockLevel.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: { product: { select: { sku: true, name: true, unit: true } } },
          ...paginate(input),
        }),
        this.prisma.stockLevel.count({ where }),
      ]);
      return {
        items: (rows as StockLevelRow[]).map(toStockRow),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  /**
   * Record an audit trail entry for a stock adjustment. Called inside the transaction that writes
   * the balance and movement, so the audit is atomic with the change.
   */
  private async recordAudit(
    prisma: PrismaService,
    actorId: string,
    entityId: string,
    outcome: AuditOutcome,
  ) {
    await prisma.auditRecord.create({
      data: { actorId, action: 'stock.adjust', entity: 'stock', entityId, outcome },
    });
  }

  @Implement(contract.inventory.adjust)
  adjust(@CurrentUser() user: User) {
    return implement(contract.inventory.adjust).handler(async ({ input }) => {
      ensurePermission(user, 'stock:adjust');

      return await this.prisma.$transaction(async (tx) => {
        try {
          // Generate unique document number for this adjustment
          const documentNumber = await nextDocumentNumber(tx, 'ADJ');

          // Lock and read the current stock level
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_storeId: { productId: input.productId, storeId: input.storeId },
            },
          });

          const balanceBefore = stockLevel?.quantity ?? 0;
          const balanceAfter = balanceBefore + input.delta;

          // Reject decreases that would drive stock negative
          if (balanceAfter < 0) {
            throw apiError('BAD_REQUEST', 'สต็อกไม่เพียงพอสำหรับการปรับลด');
          }

          // Update or create the stock level
          if (stockLevel) {
            await tx.stockLevel.update({
              where: { id: stockLevel.id },
              data: { quantity: balanceAfter },
            });
          } else {
            await tx.stockLevel.create({
              data: {
                productId: input.productId,
                storeId: input.storeId,
                quantity: balanceAfter,
                reorderThreshold: 0,
              },
            });
          }

          // Append the movement to the immutable ledger
          await tx.stockMovement.create({
            data: {
              productId: input.productId,
              storeId: input.storeId,
              delta: input.delta,
              balanceBefore,
              balanceAfter,
              type: 'ADJUSTMENT',
              sourceDocument: documentNumber,
              actorId: user.id,
            },
          });

          // Audit the success
          await this.recordAudit(tx, user.id, `${input.productId}:${input.storeId}`, 'success');

          return { balanceBefore, balanceAfter, delta: input.delta, documentNumber };
        } catch (error) {
          // Audit the failure within the transaction (then rethrow so tx rolls back)
          await this.recordAudit(tx, user.id, '', 'failure');
          throw error;
        }
      });
    });
  }
}
