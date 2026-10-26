import { type ErrorCategory, type ErrorEnvelope, ErrorEnvelopeSchema } from '@erp/contracts';
import { ORPCError } from '@orpc/nest';

/** The oRPC error codes we map to the shared envelope. Each carries a default category. */
type ApiErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT';

const DEFAULT_CATEGORY: Record<ApiErrorCode, ErrorCategory> = {
  UNAUTHORIZED: 'correct-input',
  FORBIDDEN: 'correct-input',
  NOT_FOUND: 'correct-input',
  BAD_REQUEST: 'correct-input',
  CONFLICT: 'retry',
};

/**
 * Build an {@link ORPCError} whose `data` is the shared Thai error envelope (`code` + `category`
 * + `message`). Every rejection the API raises goes through here so the client always receives the
 * same machine-checkable shape and never a stack trace or database detail.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  category: ErrorCategory = DEFAULT_CATEGORY[code],
): ORPCError<ApiErrorCode, ErrorEnvelope> {
  const data = ErrorEnvelopeSchema.parse({ code, category, message });
  return new ORPCError(code, { message, data });
}
