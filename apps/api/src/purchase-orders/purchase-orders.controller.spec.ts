import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORPCError } from '@orpc/server';
import { PrismaService } from '../database/prisma.service.js';
import { makeUser } from '../auth/test-user.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';

type PrismaStub = {
  purchaseOrder: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  purchaseOrderLine: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  documentSequence: {
    upsert: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const purchasingOfficer = makeUser('PURCHASING_OFFICER', { id: 'buyer01' });

let prisma: PrismaStub;

async function createController() {
  prisma = {
    purchaseOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    purchaseOrderLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    documentSequence: { upsert: vi.fn() },
    $transaction: vi.fn((callback) => callback(prisma)),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PurchaseOrdersController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(PurchaseOrdersController);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PurchaseOrdersController — create', () => {
  it('creates a draft PO with a unique document number', async () => {
    const controller = await createController();
    prisma.documentSequence.upsert.mockResolvedValue({ prefix: 'PO', value: 1 });
    prisma.purchaseOrder.create.mockResolvedValue({
      id: 'po1',
      documentNumber: 'PO-00001',
      supplierId: 'supplier-sup01',
      destinationStoreId: 'store-b01',
      expectedReceiptDate: new Date('2024-12-01'),
      status: 'DRAFT',
      createdById: 'buyer01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lines: [
        {
          id: 'line1',
          purchaseOrderId: 'po1',
          productId: 'product-sku001',
          orderedQuantity: 20,
          unitPrice: 4500,
        },
      ],
    });

    const result = await call(
      controller.create(purchasingOfficer),
      {
        supplierId: 'supplier-sup01',
        destinationStoreId: 'store-b01',
        expectedReceiptDate: '2024-12-01',
        lines: [{ productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 }],
      },
      { context: {} },
    );

    expect(result.documentNumber).toBe('PO-00001');
    expect(result.status).toBe('DRAFT');
    expect(result.createdById).toBe('buyer01');
    expect(result.lines).toHaveLength(1);
    expect(typeof result.expectedReceiptDate).toBe('string');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(prisma.documentSequence.upsert).toHaveBeenCalledWith({
      where: { prefix: 'PO' },
      create: { prefix: 'PO', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('creates multiple lines', async () => {
    const controller = await createController();
    prisma.documentSequence.upsert.mockResolvedValue({ prefix: 'PO', value: 2 });
    prisma.purchaseOrder.create.mockResolvedValue({
      id: 'po2',
      documentNumber: 'PO-00002',
      supplierId: 'supplier-sup01',
      destinationStoreId: 'store-b01',
      expectedReceiptDate: new Date('2024-12-01'),
      status: 'DRAFT',
      createdById: 'buyer01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lines: [
        {
          id: 'line1',
          purchaseOrderId: 'po2',
          productId: 'product-sku001',
          orderedQuantity: 20,
          unitPrice: 4500,
        },
        {
          id: 'line2',
          purchaseOrderId: 'po2',
          productId: 'product-sku002',
          orderedQuantity: 10,
          unitPrice: 3000,
        },
      ],
    });

    const result = await call(
      controller.create(purchasingOfficer),
      {
        supplierId: 'supplier-sup01',
        destinationStoreId: 'store-b01',
        expectedReceiptDate: '2024-12-01',
        lines: [
          { productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 },
          { productId: 'product-sku002', orderedQuantity: 10, unitPrice: 3000 },
        ],
      },
      { context: {} },
    );

    expect(result.lines).toHaveLength(2);
  });

  it('rejects duplicate SKU in one order', async () => {
    const controller = await createController();

    await expect(
      call(
        controller.create(purchasingOfficer),
        {
          supplierId: 'supplier-sup01',
          destinationStoreId: 'store-b01',
          expectedReceiptDate: '2024-12-01',
          lines: [
            { productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 },
            { productId: 'product-sku001', orderedQuantity: 10, unitPrice: 5000 },
          ],
        },
        { context: {} },
      ),
    ).rejects.toThrow(); // Contract validation rejects with "Input validation failed"
  });
});

describe('PurchaseOrdersController — update', () => {
  it('updates a draft PO', async () => {
    const controller = await createController();
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'po1',
      status: 'DRAFT',
      createdById: 'buyer01',
    });
    prisma.purchaseOrderLine.deleteMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrder.update.mockResolvedValue({
      id: 'po1',
      documentNumber: 'PO-00001',
      supplierId: 'supplier-sup01',
      destinationStoreId: 'store-b02',
      expectedReceiptDate: new Date('2024-12-15'),
      status: 'DRAFT',
      createdById: 'buyer01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      lines: [
        {
          id: 'line2',
          purchaseOrderId: 'po1',
          productId: 'product-sku002',
          orderedQuantity: 30,
          unitPrice: 5000,
        },
      ],
    });

    const result = await call(
      controller.update(purchasingOfficer),
      {
        id: 'po1',
        supplierId: 'supplier-sup01',
        destinationStoreId: 'store-b02',
        expectedReceiptDate: '2024-12-15',
        lines: [{ productId: 'product-sku002', orderedQuantity: 30, unitPrice: 5000 }],
      },
      { context: {} },
    );

    expect(result.destinationStoreId).toBe('store-b02');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.orderedQuantity).toBe(30);
    expect(prisma.purchaseOrderLine.deleteMany).toHaveBeenCalledWith({
      where: { purchaseOrderId: 'po1' },
    });
  });

  it('rejects updating a non-draft PO', async () => {
    const controller = await createController();
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'po1',
      status: 'SUBMITTED',
      createdById: 'buyer01',
    });

    await expect(
      call(
        controller.update(purchasingOfficer),
        {
          id: 'po1',
          supplierId: 'supplier-sup01',
          destinationStoreId: 'store-b01',
          expectedReceiptDate: '2024-12-01',
          lines: [{ productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 }],
        },
        { context: {} },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it('rejects updating a PO not owned by the user', async () => {
    const controller = await createController();
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'po1',
      status: 'DRAFT',
      createdById: 'different-user',
    });

    await expect(
      call(
        controller.update(purchasingOfficer),
        {
          id: 'po1',
          supplierId: 'supplier-sup01',
          destinationStoreId: 'store-b01',
          expectedReceiptDate: '2024-12-01',
          lines: [{ productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 }],
        },
        { context: {} },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it('rejects duplicate SKU in update', async () => {
    const controller = await createController();

    await expect(
      call(
        controller.update(purchasingOfficer),
        {
          id: 'po1',
          supplierId: 'supplier-sup01',
          destinationStoreId: 'store-b01',
          expectedReceiptDate: '2024-12-01',
          lines: [
            { productId: 'product-sku001', orderedQuantity: 20, unitPrice: 4500 },
            { productId: 'product-sku001', orderedQuantity: 15, unitPrice: 4600 },
          ],
        },
        { context: {} },
      ),
    ).rejects.toThrow(); // Contract validation rejects with "Input validation failed"
  });
});

describe('PurchaseOrdersController — get', () => {
  it('returns one PO by ID', async () => {
    const controller = await createController();
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'po1',
      documentNumber: 'PO-00001',
      supplierId: 'supplier-sup01',
      destinationStoreId: 'store-b01',
      expectedReceiptDate: new Date('2024-12-01'),
      status: 'DRAFT',
      createdById: 'buyer01',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lines: [
        {
          id: 'line1',
          purchaseOrderId: 'po1',
          productId: 'product-sku001',
          orderedQuantity: 20,
          unitPrice: 4500,
        },
      ],
    });

    const result = await call(controller.get(), { id: 'po1' }, { context: {} });

    expect(result.id).toBe('po1');
    expect(result.documentNumber).toBe('PO-00001');
    expect(result.lines).toHaveLength(1);
  });

  it('throws NOT_FOUND for missing PO', async () => {
    const controller = await createController();
    prisma.purchaseOrder.findUnique.mockResolvedValue(null);

    await expect(call(controller.get(), { id: 'missing' }, { context: {} })).rejects.toThrow(
      ORPCError,
    );
  });
});
