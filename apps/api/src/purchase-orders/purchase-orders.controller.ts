import { Controller } from '@nestjs/common';
import { contract, User } from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { ORPCError } from '@orpc/server';
import { PrismaService } from '../database/prisma.service.js';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { nextDocumentNumber } from '../inventory/document-number.service.js';

const PO_PREFIX = 'PO';

@Controller()
export class PurchaseOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('PURCHASING_OFFICER')
  @Implement(contract.purchaseOrders.create)
  create(@CurrentUser() user: User) {
    return implement(contract.purchaseOrders.create).handler(async ({ input }) => {
      return this.prisma.$transaction(async (tx) => {
        const documentNumber = await nextDocumentNumber(tx, PO_PREFIX);

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            documentNumber,
            supplierId: input.supplierId,
            destinationStoreId: input.destinationStoreId,
            expectedReceiptDate: new Date(input.expectedReceiptDate),
            status: 'DRAFT',
            createdById: user.id,
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                orderedQuantity: line.orderedQuantity,
                unitPrice: line.unitPrice,
              })),
            },
          },
          include: { lines: true },
        });

        return {
          ...purchaseOrder,
          expectedReceiptDate: purchaseOrder.expectedReceiptDate.toISOString(),
          createdAt: purchaseOrder.createdAt.toISOString(),
          updatedAt: purchaseOrder.updatedAt.toISOString(),
        };
      });
    });
  }

  @Roles('PURCHASING_OFFICER')
  @Implement(contract.purchaseOrders.update)
  update(@CurrentUser() user: User) {
    return implement(contract.purchaseOrders.update).handler(async ({ input }) => {
      return this.prisma.$transaction(async (tx) => {
        const existing = await tx.purchaseOrder.findUnique({
          where: { id: input.id },
          select: { status: true, createdById: true },
        });

        if (!existing) {
          throw new ORPCError({
            code: 'NOT_FOUND',
            message: 'Purchase order not found',
          });
        }

        if (existing.status !== 'DRAFT') {
          throw new ORPCError({
            code: 'BAD_REQUEST',
            message: 'Only draft purchase orders can be edited',
          });
        }

        if (existing.createdById !== user.id) {
          throw new ORPCError({
            code: 'FORBIDDEN',
            message: 'You can only edit your own purchase orders',
          });
        }

        // Delete existing lines and recreate them
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: input.id },
        });

        const updated = await tx.purchaseOrder.update({
          where: { id: input.id },
          data: {
            supplierId: input.supplierId,
            destinationStoreId: input.destinationStoreId,
            expectedReceiptDate: new Date(input.expectedReceiptDate),
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                orderedQuantity: line.orderedQuantity,
                unitPrice: line.unitPrice,
              })),
            },
          },
          include: { lines: true },
        });

        return {
          ...updated,
          expectedReceiptDate: updated.expectedReceiptDate.toISOString(),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      });
    });
  }

  @Implement(contract.purchaseOrders.get)
  get() {
    return implement(contract.purchaseOrders.get).handler(async ({ input }) => {
      const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
        where: { id: input.id },
        include: { lines: true },
      });

      if (!purchaseOrder) {
        throw new ORPCError({
          code: 'NOT_FOUND',
          message: 'Purchase order not found',
        });
      }

      return {
        ...purchaseOrder,
        expectedReceiptDate: purchaseOrder.expectedReceiptDate.toISOString(),
        createdAt: purchaseOrder.createdAt.toISOString(),
        updatedAt: purchaseOrder.updatedAt.toISOString(),
      };
    });
  }
}
