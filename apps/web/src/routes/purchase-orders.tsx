import { PurchaseOrderForm } from '@/components/purchase-order-form';

/** Purchase orders page: a purchasing officer creates and edits draft purchase orders. */
export function PurchaseOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ใบสั่งซื้อ</h1>
        <p className="text-muted-foreground">สร้างและจัดการใบสั่งซื้อร่าง</p>
      </div>
      <PurchaseOrderForm />
    </div>
  );
}
