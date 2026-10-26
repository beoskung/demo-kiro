import { describe, expect, it } from 'vitest';
import { ErrorCategorySchema, ErrorEnvelopeSchema } from './errors.js';

describe('ErrorCategorySchema', () => {
  it('is exactly correct-input and retry', () => {
    expect(new Set(ErrorCategorySchema.options)).toEqual(new Set(['correct-input', 'retry']));
  });
});

describe('ErrorEnvelopeSchema', () => {
  it('accepts a correct-input rejection with a Thai message', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      code: 'FORBIDDEN',
      category: 'correct-input',
      message: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a retry rejection', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      code: 'CONFLICT',
      category: 'retry',
      message: 'ข้อมูลถูกแก้ไขโดยผู้อื่น กรุณาลองใหม่',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown category', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      code: 'FORBIDDEN',
      category: 'panic',
      message: 'x',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty message', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      code: 'FORBIDDEN',
      category: 'correct-input',
      message: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a stack-trace or db-detail field leaking in', () => {
    const result = ErrorEnvelopeSchema.safeParse({
      code: 'FORBIDDEN',
      category: 'correct-input',
      message: 'x',
      stack: 'Error: at ...',
    });

    // the envelope is strict: no extra fields such as stack traces
    expect(result.success).toBe(false);
  });
});
