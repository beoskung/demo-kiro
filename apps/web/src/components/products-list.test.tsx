import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { ProductsList } from './products-list';

function renderList() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProductsList />
    </QueryClientProvider>,
  );
}

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, pageSize: 20, ...extra };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sku: 'SKU001',
    name: 'Widget',
    category: 'Hardware',
    unit: 'ชิ้น',
    sellingPrice: 1999,
    active: true,
    reorderThresholds: [],
    createdAt: '2026-10-27T01:00:00.000Z',
    ...overrides,
  };
}

describe('ProductsList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state first', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderList();

    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders products newest-first with SKU and formatted price', async () => {
    mockApi({
      'GET /products': page([
        product({ id: 'p2', sku: 'SKU002', name: 'Gadget', sellingPrice: 2500 }),
        product({ id: 'p1', sku: 'SKU001', name: 'Widget', sellingPrice: 1999 }),
      ]),
    });

    renderList();

    const rows = await screen.findAllByRole('row');
    // Row 0 is the header; the first data row is the newest product (SKU002).
    expect(within(rows[1]!).getByText('SKU002')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('฿25.00')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('SKU001')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('฿19.99')).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', async () => {
    mockApi({ 'GET /products': page([]) });

    renderList();

    expect(await screen.findByText(/ยังไม่มีสินค้า/)).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    renderList();

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      /เกิดข้อผิดพลาด/,
    );
  });

  it('marks a deactivated product as inactive but still shows it (searchable in history)', async () => {
    mockApi({
      'GET /products': page([
        product({ id: 'p9', sku: 'SKU009', name: 'Old item', active: false }),
      ]),
    });

    renderList();

    // The deactivated product is still rendered (stays searchable)...
    expect(await screen.findByText('SKU009')).toBeInTheDocument();
    // ...and is clearly marked inactive so it is not treated as available for a new document.
    expect(screen.getByText('ปิดใช้งาน')).toBeInTheDocument();
  });

  it('requests inactive products when the historical toggle is turned on', async () => {
    const fetch = mockApi({ 'GET /products': page([product()]) });

    renderList();

    await screen.findByText('SKU001');
    fireEvent.click(screen.getByLabelText(/รวมสินค้าที่ปิดใช้งาน/));

    await vi.waitFor(() => {
      const requestedFlags = fetch.mock.calls.map(([request]) =>
        new URL((request as Request).url).searchParams.get('includeInactive'),
      );
      expect(requestedFlags).toContain('true');
    });
  });

  it('pages forward and requests the next page', async () => {
    const fetch = mockApi({
      'GET /products': page([product()], { total: 40, page: 1, pageSize: 20 }),
    });

    renderList();

    await screen.findByText('SKU001');
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/ }));

    await vi.waitFor(() => {
      const requestedPages = fetch.mock.calls.map(([request]) =>
        new URL((request as Request).url).searchParams.get('page'),
      );
      expect(requestedPages).toContain('2');
    });
  });
});
