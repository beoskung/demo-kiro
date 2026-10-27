import { ProductsList } from '@/components/products-list';

/** Master-data products page: an administrator browses the catalogue (paginated, newest-first). */
export function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ข้อมูลหลัก: สินค้า</h1>
        <p className="text-muted-foreground">จัดการและเรียกดูสินค้าทั้งหมดในแคตตาล็อก</p>
      </div>
      <ProductsList />
    </div>
  );
}
