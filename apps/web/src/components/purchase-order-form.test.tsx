import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { PurchaseOrderForm } from './purchase-order-form';

function renderWithQueryClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

describe('PurchaseOrderForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows loading state while fetching suppliers and stores', () => {
    mockApi({
      'GET /master-data/suppliers': new Promise(() => {}), // Never resolves
      'GET /master-data/stores': new Promise(() => {}),
    });

    renderWithQueryClient(<PurchaseOrderForm />);

    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('shows empty state when no suppliers available', async () => {
    mockApi({
      'GET /master-data/suppliers': { items: [], total: 0, page: 1, pageSize: 100 },
      'GET /master-data/stores': {
        items: [{ id: 'store-b01', code: 'B01', name: 'Central Store', createdAt: '2024-01-01' }],
        total: 1,
        page: 1,
        pageSize: 100,
      },
    });

    renderWithQueryClient(<PurchaseOrderForm />);

    expect(await screen.findByText(/ยังไม่มีซัพพลายเออร์/)).toBeInTheDocument();
  });

  it('creates a draft purchase order', async () => {
    const fetchMock = mockApi({
      'GET /master-data/suppliers': {
        items: [
          {
            id: 'supplier-sup01',
            code: 'SUP01',
            name: 'SupplyOne Co Ltd',
            contact: '',
            createdAt: '2024-01-01',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      },
      'GET /master-data/stores': {
        items: [{ id: 'store-b01', code: 'B01', name: 'Central Store', createdAt: '2024-01-01' }],
        total: 1,
        page: 1,
        pageSize: 100,
      },
      'POST /purchase-orders': {
        id: 'po1',
        documentNumber: 'PO-00001',
        supplierId: 'supplier-sup01',
        destinationStoreId: 'store-b01',
        expectedReceiptDate: '2024-12-01T00:00:00.000Z',
        status: 'DRAFT',
        createdById: 'u1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lines: [
          {
            id: 'line1',
            productId: 'product-sku001',
            orderedQuantity: 20,
            unitPrice: 4500,
          },
        ],
      },
    });

    renderWithQueryClient(<PurchaseOrderForm />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByLabelText('ซัพพลายเออร์')).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText('ซัพพลายเออร์'), {
      target: { value: 'supplier-sup01' },
    });
    fireEvent.change(screen.getByLabelText('สาขาปลายทาง'), { target: { value: 'store-b01' } });
    fireEvent.change(screen.getByLabelText('วันที่คาดว่าจะได้รับ'), {
      target: { value: '2024-12-01' },
    });
    fireEvent.change(screen.getByLabelText('รหัสสินค้า'), {
      target: { value: 'product-sku001' },
    });
    fireEvent.change(screen.getByLabelText('จำนวนสั่งซื้อ'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('ราคาต่อหน่วย (บาท)'), { target: { value: '45.00' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'สร้างใบสั่งซื้อ' }));

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText(/สร้างใบสั่งซื้อสำเร็จ/)).toBeInTheDocument();
    });

    // Verify API call
    const calls = fetchMock.mock.calls.filter(
      (call) => call[0] instanceof Request && call[0].method === 'POST',
    );
    expect(calls).toHaveLength(1);
  });

  it('rejects duplicate SKU', async () => {
    mockApi({
      'GET /master-data/suppliers': {
        items: [
          {
            id: 'supplier-sup01',
            code: 'SUP01',
            name: 'SupplyOne Co Ltd',
            contact: '',
            createdAt: '2024-01-01',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      },
      'GET /master-data/stores': {
        items: [{ id: 'store-b01', code: 'B01', name: 'Central Store', createdAt: '2024-01-01' }],
        total: 1,
        page: 1,
        pageSize: 100,
      },
      'POST /purchase-orders': Response.json(
        {
          defined: false,
          code: 'BAD_REQUEST',
          status: 400,
          message: 'The same SKU cannot appear twice in one order',
        },
        { status: 400 },
      ),
    });

    renderWithQueryClient(<PurchaseOrderForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('ซัพพลายเออร์')).toBeInTheDocument();
    });

    // Try to add duplicate
    fireEvent.change(screen.getByLabelText('ซัพพลายเออร์'), {
      target: { value: 'supplier-sup01' },
    });
    fireEvent.change(screen.getByLabelText('สาขาปลายทาง'), { target: { value: 'store-b01' } });
    fireEvent.change(screen.getByLabelText('วันที่คาดว่าจะได้รับ'), {
      target: { value: '2024-12-01' },
    });
    fireEvent.change(screen.getByLabelText('รหัสสินค้า'), {
      target: { value: 'product-sku001' },
    });
    fireEvent.change(screen.getByLabelText('จำนวนสั่งซื้อ'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('ราคาต่อหน่วย (บาท)'), { target: { value: '45.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'สร้างใบสั่งซื้อ' }));

    // Should show error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/same SKU cannot appear twice/i);
    });
  });
});
