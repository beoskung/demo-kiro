import { StoresList } from '@/components/stores-list';

/** Master-data stores page: an administrator browses the stores list (paginated, newest-first). */
export function StoresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ข้อมูลหลัก: สาขา</h1>
        <p className="text-muted-foreground">จัดการและเรียกดูสาขาทั้งหมดขององค์กร</p>
      </div>
      <StoresList />
    </div>
  );
}
