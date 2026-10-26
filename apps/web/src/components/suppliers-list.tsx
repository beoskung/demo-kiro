import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orpc } from '@/lib/orpc';

const PAGE_SIZE = 20;

/**
 * The suppliers master-data list. Mirrors the shared list behaviour established by StoresList —
 * pagination, newest-first ordering, and explicit loading / success / empty / error states — and
 * reads through the typed oRPC client only.
 */
export function SuppliersList() {
  const [page, setPage] = useState(1);
  const suppliers = useQuery(
    orpc.masterData.suppliers.list.queryOptions({ input: { page, pageSize: PAGE_SIZE } }),
  );

  const totalPages = suppliers.data ? Math.max(1, Math.ceil(suppliers.data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ผู้จัดจำหน่าย</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {suppliers.isPending ? (
          <p className="text-muted-foreground">กำลังโหลด…</p>
        ) : suppliers.isError ? (
          <p role="alert" className="text-destructive">
            เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
          </p>
        ) : suppliers.data.items.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่มีผู้จัดจำหน่าย</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 font-medium">รหัส</th>
                <th className="py-2 pr-4 font-medium">ชื่อ</th>
                <th className="py-2 font-medium">ติดต่อ</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.data.items.map((supplier) => (
                <tr key={supplier.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{supplier.code}</td>
                  <td className="py-2 pr-4">{supplier.name}</td>
                  <td className="py-2">{supplier.contact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {suppliers.data && suppliers.data.total > 0 && (
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
