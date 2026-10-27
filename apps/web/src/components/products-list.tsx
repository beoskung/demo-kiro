import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orpc } from '@/lib/orpc';

const PAGE_SIZE = 20;

/** Format a satang price (whole number) as Thai baht, e.g. 1999 -> "฿19.99". */
function formatPrice(satang: number) {
  return `฿${(satang / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The products master-data list. It reads through the typed oRPC client only and shows the
 * catalogue with its SKU, name, category, unit, selling price, and active status. A historical
 * lookup (the "รวมสินค้าที่ปิดใช้งาน" toggle) also shows deactivated products, which stay
 * searchable but are marked inactive so they are not treated as available for a new document.
 */
export function ProductsList() {
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const products = useQuery(
    orpc.products.list.queryOptions({ input: { page, pageSize: PAGE_SIZE, includeInactive } }),
  );

  const totalPages = products.data ? Math.max(1, Math.ceil(products.data.total / PAGE_SIZE)) : 1;

  function toggleInactive() {
    setPage(1);
    setIncludeInactive((current) => !current);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>สินค้า</CardTitle>
        <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          <input type="checkbox" checked={includeInactive} onChange={toggleInactive} />
          รวมสินค้าที่ปิดใช้งาน
        </label>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.isPending ? (
          <p className="text-muted-foreground">กำลังโหลด…</p>
        ) : products.isError ? (
          <p role="alert" className="text-destructive">
            เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
          </p>
        ) : products.data.items.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่มีสินค้า</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 font-medium">SKU</th>
                <th className="py-2 pr-4 font-medium">ชื่อ</th>
                <th className="py-2 pr-4 font-medium">หมวดหมู่</th>
                <th className="py-2 pr-4 font-medium">หน่วย</th>
                <th className="py-2 pr-4 font-medium text-right">ราคาขาย</th>
                <th className="py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {products.data.items.map((product) => (
                <tr key={product.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{product.sku}</td>
                  <td className="py-2 pr-4">{product.name}</td>
                  <td className="py-2 pr-4">{product.category}</td>
                  <td className="py-2 pr-4">{product.unit}</td>
                  <td className="py-2 pr-4 text-right">{formatPrice(product.sellingPrice)}</td>
                  <td className="py-2">
                    {product.active ? (
                      <Badge variant="secondary">ใช้งาน</Badge>
                    ) : (
                      <Badge variant="outline">ปิดใช้งาน</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {products.data && products.data.total > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              หน้า {page} จาก {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                ถัดไป
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
