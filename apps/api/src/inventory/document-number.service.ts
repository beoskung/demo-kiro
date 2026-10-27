/**
 * The unique document-number generator (§4.3). Receipts and sales mint human-readable numbers of
 * the form `<PREFIX>-<zero-padded running value>` (e.g. `GR-00001`, `SA-00042`). Each prefix has
 * its own counter row in `DocumentSequence`; the counter is bumped with an **atomic increment**
 * inside the caller's transaction, so two concurrent callers can never be handed the same number.
 *
 * The functions take the Prisma client (or an interactive-transaction client) as an argument so a
 * later ticket can mint a number in the *same* transaction that posts the document and moves stock.
 */

/** The width the running value is zero-padded to. Values wider than this are not truncated. */
const PAD_WIDTH = 5;

/** The minimal surface the generator needs: an upsert on the `documentSequence` model. */
export interface DocumentSequenceClient {
  documentSequence: {
    upsert(args: {
      where: { prefix: string };
      create: { prefix: string; value: number };
      update: { value: { increment: number } };
    }): Promise<{ prefix: string; value: number }>;
  };
}

/** Format a prefix and running value into a document number, e.g. `('GR', 1) → 'GR-00001'`. */
export function formatDocumentNumber(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(PAD_WIDTH, '0')}`;
}

/**
 * Hand out the next unique document number for `prefix`. The sequence row is created at 1 on first
 * use and atomically incremented thereafter, so repeated calls always return distinct numbers.
 * Call it inside the transaction that posts the document so the number is reserved atomically.
 */
export async function nextDocumentNumber(
  prisma: DocumentSequenceClient,
  prefix: string,
): Promise<string> {
  const sequence = await prisma.documentSequence.upsert({
    where: { prefix },
    create: { prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatDocumentNumber(prefix, sequence.value);
}
