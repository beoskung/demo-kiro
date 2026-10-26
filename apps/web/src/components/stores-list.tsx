import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { orpc } from '@/lib/orpc';

const PAGE_SIZE = 20;

/**
 * The stores master-data list: the first ERP list, and the reference for the shared list
 * behaviour (pagination, newest-first ordering, and explicit loading / success / empty / error
 * states). It reads through the typed oRPC client only — no hand-written fetch.
 */
export function StoresList() {
  const [page, setPage] = useState(1);
  const stores = useQuery(
    orpc.masterData.stores.list.queryOptions({ input: { page, pageSize: PAGE_SIZE } }),
  );

  const totalPages = stores.data ? Math.max(1, Math.ceil(stores.data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>สาขา</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stores.isPending ? (
          <p className="text-muted-foreground">กำลังโหลด…</p>
        ) : stores.isError ? (
          <p role="alert" className="text-destructive">
            เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
          </p>
        ) : stores.data.items.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่มีสาขา</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 font-medium">รหัส</th>
                <th className="py-2 font-medium">ชื่อ</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.items.map((store) => (
                <tr key={store.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{store.code}</td>
                  <td className="py-2">{store.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {stores.data && stores.data.total > 0 && (
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
