import * as z from 'zod';

/**
 * Whether the caller should fix their request or simply retry.
 * - `correct-input`: a validation / permission / not-found problem the caller must change.
 * - `retry`: a conflict or transient problem the caller may safely retry.
 */
export const ErrorCategorySchema = z.enum(['correct-input', 'retry']);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

/**
 * The single error shape every API rejection returns. It carries a machine-readable `code`,
 * a `category` that tells the caller whether to correct input or retry, and a Thai `message`.
 * It is strict on purpose: stack traces and database details must never leak through it.
 */
export const ErrorEnvelopeSchema = z
  .object({
    code: z.string().min(1),
    category: ErrorCategorySchema,
    message: z.string().min(1),
  })
  .strict();
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
