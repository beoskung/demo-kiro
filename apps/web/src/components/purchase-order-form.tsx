import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { orpc } from '@/lib/orpc';

interface PurchaseOrderLine {
  productId: string;
  orderedQuantity: number;
  unitPrice: number;
}

export function PurchaseOrderForm() {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [expectedReceiptDate, setExpectedReceiptDate] = useState('');
  const [productId, setProductId] = useState('');
  const [orderedQuantity, setOrderedQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const suppliers = useQuery(
    orpc.masterData.suppliers.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
  );

  const stores = useQuery(
    orpc.masterData.stores.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
  );

  const createPO = useMutation(
    orpc.purchaseOrders.create.mutationOptions({
      onSuccess: (data) => {
        setSuccessMessage(`สร้างใบสั่งซื้อสำเร็จ: ${data.documentNumber}`);
        setErrorMessage('');
        // Reset form
        setSupplierId('');
        setDestinationStoreId('');
        setExpectedReceiptDate('');
        setProductId('');
        setOrderedQuantity('');
        setUnitPrice('');
        queryClient.invalidateQueries({ queryKey: orpc.purchaseOrders.key() });
      },
      onError: (error) => {
        setErrorMessage(
          error.message ||
            'เกิดข้อผิดพลาดในการสร้างใบสั่งซื้อ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง',
        );
        setSuccessMessage('');
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const lines: PurchaseOrderLine[] = [
      {
        productId,
        orderedQuantity: parseInt(orderedQuantity, 10),
        unitPrice: Math.round(parseFloat(unitPrice) * 100), // Convert THB to satang
      },
    ];

    createPO.mutate({
      supplierId,
      destinationStoreId,
      expectedReceiptDate,
      lines,
    });
  };

  if (suppliers.isPending || stores.isPending) {
    return <p className="text-muted-foreground">กำลังโหลด…</p>;
  }

  if (suppliers.isError || stores.isError) {
    return (
      <p role="alert" className="text-destructive">
        เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
      </p>
    );
  }

  if (suppliers.data.items.length === 0) {
    return <p className="text-muted-foreground">ยังไม่มีซัพพลายเออร์ กรุณาเพิ่มซัพพลายเออร์ก่อน</p>;
  }

  if (stores.data.items.length === 0) {
    return <p className="text-muted-foreground">ยังไม่มีสาขา กรุณาเพิ่มสาขาก่อน</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>สร้างใบสั่งซื้อร่าง</CardTitle>
        <CardDescription>กรอกข้อมูลเพื่อสร้างใบสั่งซื้อร่าง</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">ซัพพลายเออร์</Label>
            <select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">เลือกซัพพลายเออร์</option>
              {suppliers.data.items.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store">สาขาปลายทาง</Label>
            <select
              id="store"
              value={destinationStoreId}
              onChange={(e) => setDestinationStoreId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">เลือกสาขา</option>
              {stores.data.items.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} - {store.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expected-date">วันที่คาดว่าจะได้รับ</Label>
            <Input
              id="expected-date"
              type="date"
              value={expectedReceiptDate}
              onChange={(e) => setExpectedReceiptDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-id">รหัสสินค้า</Label>
            <Input
              id="product-id"
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              placeholder="product-sku001"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">จำนวนสั่งซื้อ</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={orderedQuantity}
              onChange={(e) => setOrderedQuantity(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit-price">ราคาต่อหน่วย (บาท)</Label>
            <Input
              id="unit-price"
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              required
            />
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}

          <Button type="submit" disabled={createPO.isPending}>
            {createPO.isPending ? 'กำลังสร้าง…' : 'สร้างใบสั่งซื้อ'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
