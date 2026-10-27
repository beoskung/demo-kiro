import { Controller } from '@nestjs/common';
import { type AuditOutcome, type PaginationInput, type User, contract } from '@erp/contracts';
import { Implement, implement } from '@orpc/nest';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import { ensurePermission } from '../auth/permission.js';
import { PrismaService } from '../database/prisma.service.js';

/** Prisma rows carry Date objects; the contract returns ISO strings. */
type StoreRow = { id: string; code: string; name: string; createdAt: Date };
type SupplierRow = StoreRow & { contact: string };
type AuditRow = {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  outcome: AuditOutcome;
  createdAt: Date;
};

function toStore(row: StoreRow) {
  return { id: row.id, code: row.code, name: row.name, createdAt: row.createdAt.toISOString() };
}

function toSupplier(row: SupplierRow) {
  return { ...toStore(row), contact: row.contact };
}

function toAudit(row: AuditRow) {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Turn a 1-based page + size into Prisma's skip/take. */
function paginate({ page, pageSize }: PaginationInput) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Master data: stores and suppliers. Writes are restricted to an ADMINISTRATOR both at the guard
 * (`@Roles`) and in the handler (`ensurePermission('master-data:manage')`) — role is enforced at
 * the API, never by hiding UI alone. Every write, and audit-log access, go through the permission
 * check; each successful write appends an audit record (actor, action, entity, outcome).
 */
@Controller()
@Roles('ADMINISTRATOR')
export class MasterDataController {
  constructor(private readonly prisma: PrismaService) {}

  private async recordAudit(
    actorId: string,
    action: string,
    entity: string,
    entityId: string,
    outcome: AuditOutcome,
  ) {
    await this.prisma.auditRecord.create({
      data: { actorId, action, entity, entityId, outcome },
    });
  }

  /**
   * Run an audited write: execute `write`, then append an audit record capturing the outcome.
   * A success is audited with the created/updated entity's id; a failure is audited as `failure`
   * (entity id unknown) and the original error is rethrown. Every authorized write — whether it
   * lands or is refused by the database — leaves an audit trail (NFR-03).
   */
  private async auditedWrite<T extends { id: string }>(
    actorId: string,
    action: string,
    entity: string,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await write();
      await this.recordAudit(actorId, action, entity, result.id, 'success');
      return result;
    } catch (error) {
      await this.recordAudit(actorId, action, entity, '', 'failure');
      throw error;
    }
  }

  @Implement(contract.masterData.stores.create)
  createStore(@CurrentUser() user: User) {
    return implement(contract.masterData.stores.create).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const store = await this.auditedWrite(
        user.id,
        'store.create',
        'store',
        () =>
          this.prisma.store.create({
            data: { code: input.code, name: input.name },
          }) as Promise<StoreRow>,
      );
      return toStore(store);
    });
  }

  @Implement(contract.masterData.stores.update)
  updateStore(@CurrentUser() user: User) {
    return implement(contract.masterData.stores.update).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const store = await this.auditedWrite(
        user.id,
        'store.update',
        'store',
        () =>
          this.prisma.store.update({
            where: { id: input.id },
            data: { code: input.code, name: input.name },
          }) as Promise<StoreRow>,
      );
      return toStore(store);
    });
  }

  @Implement(contract.masterData.stores.list)
  listStores(@CurrentUser() user: User) {
    return implement(contract.masterData.stores.list).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const [rows, total] = await Promise.all([
        this.prisma.store.findMany({ orderBy: { createdAt: 'desc' }, ...paginate(input) }),
        this.prisma.store.count(),
      ]);
      return {
        items: (rows as StoreRow[]).map(toStore),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  @Implement(contract.masterData.suppliers.create)
  createSupplier(@CurrentUser() user: User) {
    return implement(contract.masterData.suppliers.create).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const supplier = await this.auditedWrite(
        user.id,
        'supplier.create',
        'supplier',
        () =>
          this.prisma.supplier.create({
            data: { code: input.code, name: input.name, contact: input.contact },
          }) as Promise<SupplierRow>,
      );
      return toSupplier(supplier);
    });
  }

  @Implement(contract.masterData.suppliers.update)
  updateSupplier(@CurrentUser() user: User) {
    return implement(contract.masterData.suppliers.update).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const supplier = await this.auditedWrite(
        user.id,
        'supplier.update',
        'supplier',
        () =>
          this.prisma.supplier.update({
            where: { id: input.id },
            data: { code: input.code, name: input.name, contact: input.contact },
          }) as Promise<SupplierRow>,
      );
      return toSupplier(supplier);
    });
  }

  @Implement(contract.masterData.suppliers.list)
  listSuppliers(@CurrentUser() user: User) {
    return implement(contract.masterData.suppliers.list).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const [rows, total] = await Promise.all([
        this.prisma.supplier.findMany({ orderBy: { createdAt: 'desc' }, ...paginate(input) }),
        this.prisma.supplier.count(),
      ]);
      return {
        items: (rows as SupplierRow[]).map(toSupplier),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  @Implement(contract.masterData.audit.list)
  listAudit(@CurrentUser() user: User) {
    return implement(contract.masterData.audit.list).handler(async ({ input }) => {
      ensurePermission(user, 'master-data:manage');
      const [rows, total] = await Promise.all([
        this.prisma.auditRecord.findMany({ orderBy: { createdAt: 'desc' }, ...paginate(input) }),
        this.prisma.auditRecord.count(),
      ]);
      return {
        items: (rows as AuditRow[]).map(toAudit),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }
}
