import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { SuppliersList } from './suppliers-list';

function renderList() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SuppliersList />
    </QueryClientProvider>,
  );
}

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, pageSize: 20, ...extra };
}

const supA = {
  id: 'sup2',
  code: 'SUP02',
  name: 'Supplier 02',
  contact: '02-222-2222',
  createdAt: '2026-10-26T02:00:00.000Z',
};
const supB = {
  id: 'sup1',
  code: 'SUP01',
  name: 'Supplier 01',
  contact: '02-111-1111',
  createdAt: '2026-10-26T01:00:00.000Z',
};

describe('SuppliersList', () => {
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

  it('renders suppliers newest-first with their contact on success', async () => {
    mockApi({ 'GET /master-data/suppliers': page([supA, supB]) });

    renderList();

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('SUP02')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('02-222-2222')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('SUP01')).toBeInTheDocument();
  });

  it('shows an empty state when there are no suppliers', async () => {
    mockApi({ 'GET /master-data/suppliers': page([]) });

    renderList();

    expect(await screen.findByText(/ยังไม่มีผู้จัดจำหน่าย/)).toBeInTheDocument();
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

  it('pages forward and requests the next page', async () => {
    const fetch = mockApi({
      'GET /master-data/suppliers': page([supA], { total: 40, page: 1, pageSize: 20 }),
    });

    renderList();

    await screen.findByText('SUP02');
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/ }));

    await vi.waitFor(() => {
      const requestedPages = fetch.mock.calls.map(([request]) =>
        new URL((request as Request).url).searchParams.get('page'),
      );
      expect(requestedPages).toContain('2');
    });
  });
});
