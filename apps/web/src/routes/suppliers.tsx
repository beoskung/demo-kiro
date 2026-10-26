import { SuppliersList } from '@/components/suppliers-list';

/** Master-data suppliers page: an administrator browses the suppliers list (paginated, newest-first). */
export function SuppliersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ข้อมูลหลัก: ผู้จัดจำหน่าย</h1>
        <p className="text-muted-foreground">จัดการและเรียกดูผู้จัดจำหน่ายทั้งหมด</p>
      </div>
      <SuppliersList />
    </div>
  );
}
