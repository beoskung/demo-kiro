import { describe, expect, it, vi } from 'vitest';
import { formatDocumentNumber, nextDocumentNumber } from './document-number.service.js';

describe('formatDocumentNumber', () => {
  it('zero-pads the running value to five digits behind the prefix', () => {
    expect(formatDocumentNumber('GR', 1)).toBe('GR-00001');
    expect(formatDocumentNumber('SA', 42)).toBe('SA-00042');
  });

  it('does not truncate a value wider than the padding', () => {
    expect(formatDocumentNumber('GR', 123456)).toBe('GR-123456');
  });
});

describe('nextDocumentNumber', () => {
  it('atomically increments the sequence for the prefix and formats the number', async () => {
    const upsert = vi.fn().mockResolvedValue({ prefix: 'GR', value: 1 });
    const prisma = { documentSequence: { upsert } };

    const number = await nextDocumentNumber(prisma, 'GR');

    expect(number).toBe('GR-00001');
    // The counter is bumped with an atomic increment (never a read-then-write), so concurrent
    // callers can never be handed the same value.
    expect(upsert).toHaveBeenCalledWith({
      where: { prefix: 'GR' },
      create: { prefix: 'GR', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('returns successive numbers as the stored value climbs', async () => {
    let value = 0;
    const upsert = vi.fn().mockImplementation(async () => ({ prefix: 'SA', value: ++value }));
    const prisma = { documentSequence: { upsert } };

    const first = await nextDocumentNumber(prisma, 'SA');
    const second = await nextDocumentNumber(prisma, 'SA');

    expect(first).toBe('SA-00001');
    expect(second).toBe('SA-00002');
    expect(first).not.toBe(second);
  });

  it('produces unique numbers under repeated calls', async () => {
    // A stateful stub stands in for the atomic counter so uniqueness is proven behaviourally at
    // this seam — not only by the mock's call shape — even in the DB-less test lane.
    let value = 0;
    const upsert = vi.fn().mockImplementation(async () => ({ prefix: 'GR', value: ++value }));
    const prisma = { documentSequence: { upsert } };

    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(await nextDocumentNumber(prisma, 'GR'));
    }

    expect(seen.size).toBe(50);
    expect(seen.has('GR-00001')).toBe(true);
    expect(seen.has('GR-00050')).toBe(true);
  });
});
