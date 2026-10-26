import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema } from '@erp/contracts';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { makeUser } from '../auth/test-user.js';
import { MasterDataController } from './master-data.controller.js';

type PrismaStub = {
  store: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  supplier: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  auditRecord: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const admin = makeUser('ADMINISTRATOR', { id: 'admin-1' });
const storeEmployee = makeUser('STORE_EMPLOYEE', { id: 'emp-1' });
const manager = makeUser('MANAGER', { id: 'mgr-1' });

function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    code: 'B01',
    name: 'Branch 01',
    createdAt: new Date('2026-10-26T00:00:00.000Z'),
    ...overrides,
  };
}

function supplierRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup1',
    code: 'SUP01',
    name: 'Supplier 01',
    contact: '02-123-4567',
    createdAt: new Date('2026-10-26T00:00:00.000Z'),
    ...overrides,
  };
}

let prisma: PrismaStub;

async function createController() {
  prisma = {
    store: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    supplier: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    auditRecord: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [MasterDataController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(MasterDataController);
}

function expectEnvelope(error: { code?: string; data?: unknown }) {
  const envelope = ErrorEnvelopeSchema.parse(error.data);
  expect(envelope.message).toMatch(/[\u0E00-\u0E7F]/); // Thai message
  expect(JSON.stringify(error.data)).not.toMatch(/stack|prisma|at /i);
  return envelope;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MasterDataController — stores', () => {
  it('lets an administrator create a store and writes a success audit record', async () => {
    const controller = await createController();
    prisma.store.create.mockResolvedValue(storeRow());

    const result = await call(
      controller.createStore(admin),
      { code: 'B01', name: 'Branch 01' },
      { context: {} },
    );

    expect(result).toMatchObject({ id: 's1', code: 'B01', name: 'Branch 01' });
    expect(prisma.store.create).toHaveBeenCalledWith({ data: { code: 'B01', name: 'Branch 01' } });
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'store.create',
        entity: 'store',
        entityId: 's1',
        outcome: 'success',
      }),
    });
  });

  it('lets an administrator edit a store', async () => {
    const controller = await createController();
    prisma.store.update.mockResolvedValue(storeRow({ name: 'Branch 01 renamed' }));

    const result = await call(
      controller.updateStore(admin),
      { id: 's1', code: 'B01', name: 'Branch 01 renamed' },
      { context: {} },
    );

    expect(result.name).toBe('Branch 01 renamed');
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { code: 'B01', name: 'Branch 01 renamed' },
    });
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'store.update', entityId: 's1', outcome: 'success' }),
    });
  });

  it('lists stores newest-first with pagination metadata', async () => {
    const controller = await createController();
    prisma.store.findMany.mockResolvedValue([
      storeRow({ id: 's2', code: 'B02', createdAt: new Date('2026-10-26T02:00:00.000Z') }),
      storeRow({ id: 's1', code: 'B01', createdAt: new Date('2026-10-26T01:00:00.000Z') }),
    ]);
    prisma.store.count.mockResolvedValue(2);

    const result = await call(
      controller.listStores(admin),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(result.items.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('paginates the second page with the right skip/take', async () => {
    const controller = await createController();
    prisma.store.findMany.mockResolvedValue([]);
    prisma.store.count.mockResolvedValue(30);

    await call(controller.listStores(admin), { page: 2, pageSize: 20 }, { context: {} });

    expect(prisma.store.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('rejects a non-administrator creating a store with the error envelope', async () => {
    const controller = await createController();

    const error = await call(
      controller.createStore(storeEmployee),
      { code: 'B01', name: 'Branch 01' },
      { context: {} },
    ).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expect(expectEnvelope(error).category).toBe('correct-input');
    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('rejects a non-administrator editing a store', async () => {
    const controller = await createController();

    const error = await call(
      controller.updateStore(manager),
      { id: 's1', code: 'B01', name: 'x' },
      { context: {} },
    ).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });
});

describe('MasterDataController — suppliers', () => {
  it('lets an administrator create a supplier and writes an audit record', async () => {
    const controller = await createController();
    prisma.supplier.create.mockResolvedValue(supplierRow());

    const result = await call(
      controller.createSupplier(admin),
      { code: 'SUP01', name: 'Supplier 01', contact: '02-123-4567' },
      { context: {} },
    );

    expect(result).toMatchObject({ id: 'sup1', code: 'SUP01', contact: '02-123-4567' });
    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'supplier.create',
        entity: 'supplier',
        outcome: 'success',
      }),
    });
  });

  it('lets an administrator edit a supplier', async () => {
    const controller = await createController();
    prisma.supplier.update.mockResolvedValue(supplierRow({ contact: '02-999-9999' }));

    const result = await call(
      controller.updateSupplier(admin),
      { id: 'sup1', code: 'SUP01', name: 'Supplier 01', contact: '02-999-9999' },
      { context: {} },
    );

    expect(result.contact).toBe('02-999-9999');
    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'sup1' },
      data: { code: 'SUP01', name: 'Supplier 01', contact: '02-999-9999' },
    });
  });

  it('lists suppliers newest-first', async () => {
    const controller = await createController();
    prisma.supplier.findMany.mockResolvedValue([supplierRow()]);
    prisma.supplier.count.mockResolvedValue(1);

    const result = await call(
      controller.listSuppliers(admin),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items).toHaveLength(1);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('rejects a non-administrator creating a supplier', async () => {
    const controller = await createController();

    const error = await call(
      controller.createSupplier(storeEmployee),
      { code: 'SUP01', name: 'Supplier 01', contact: '' },
      { context: {} },
    ).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expect(prisma.supplier.create).not.toHaveBeenCalled();
  });
});

describe('MasterDataController — audit access', () => {
  it('lets an administrator read the audit log newest-first', async () => {
    const controller = await createController();
    prisma.auditRecord.findMany.mockResolvedValue([
      {
        id: 'a1',
        actorId: 'admin-1',
        action: 'store.create',
        entity: 'store',
        entityId: 's1',
        outcome: 'success',
        createdAt: new Date('2026-10-26T00:00:00.000Z'),
      },
    ]);
    prisma.auditRecord.count.mockResolvedValue(1);

    const result = await call(
      controller.listAudit(admin),
      { page: 1, pageSize: 20 },
      { context: {} },
    );

    expect(result.items).toHaveLength(1);
    expect(prisma.auditRecord.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('rejects a non-administrator reading the audit log with the envelope', async () => {
    const controller = await createController();

    const error = await call(
      controller.listAudit(storeEmployee),
      { page: 1, pageSize: 20 },
      { context: {} },
    ).catch((e) => e);

    expect(error.code).toBe('FORBIDDEN');
    expectEnvelope(error);
    expect(prisma.auditRecord.findMany).not.toHaveBeenCalled();
  });
});
