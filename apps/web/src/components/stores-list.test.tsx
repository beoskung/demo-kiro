import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { mockApi } from '@/test/mock-api';
import { StoresList } from './stores-list';

function renderList() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <StoresList />
    </QueryClientProvider>,
  );
}

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, pageSize: 20, ...extra };
}

const storeA = { id: 's2', code: 'B02', name: 'Branch 02', createdAt: '2026-10-26T02:00:00.000Z' };
const storeB = { id: 's1', code: 'B01', name: 'Branch 01', createdAt: '2026-10-26T01:00:00.000Z' };

describe('StoresList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state first', () => {
    // Never-resolving fetch keeps the query pending.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderList();

    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders stores newest-first on success', async () => {
    mockApi({ 'GET /master-data/stores': page([storeA, storeB]) });

    renderList();

    const rows = await screen.findAllByRole('row');
    // First data row is the newest store (B02), then B01. Row 0 is the header.
    expect(within(rows[1]!).getByText('B02')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('B01')).toBeInTheDocument();
  });

  it('shows an empty state when there are no stores', async () => {
    mockApi({ 'GET /master-data/stores': page([]) });

    renderList();

    expect(await screen.findByText(/ยังไม่มีสาขา/)).toBeInTheDocument();
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
      'GET /master-data/stores': page([storeA], { total: 40, page: 1, pageSize: 20 }),
    });

    renderList();

    await screen.findByText('B02');
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/ }));

    // The second call must ask for page 2 through the typed client (query string on /api).
    await vi.waitFor(() => {
      const requestedPages = fetch.mock.calls.map(
        ([request]) => new URL((request as Request).url).searchParams.get('page'),
      );
      expect(requestedPages).toContain('2');
    });
  });
});
