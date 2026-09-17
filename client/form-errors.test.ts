import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { describeError } from './form-errors';
import { ApiError } from './api';

describe('form error mapping', () => {
  it('maps known server codes to localized text in both languages', () => {
    for (const t of Object.values(messages)) {
      expect(describeError(t, new ApiError(401, 'INVALID_CREDENTIALS', 'ignored'))).toBe(t.errorInvalidCredentials);
      expect(describeError(t, new ApiError(409, 'EMAIL_TAKEN', 'ignored'))).toBe(t.errorEmailTaken);
      expect(describeError(t, new ApiError(400, 'VALIDATION_ERROR', 'ignored'))).toBe(t.errorValidation);
    }
  });
  it('treats an unreachable server as a network error', () => {
    for (const t of Object.values(messages)) {
      expect(describeError(t, new ApiError(0, 'NETWORK', 'ignored'))).toBe(t.errorNetwork);
    }
  });
  it('falls back to a generic message for unknown failures', () => {
    expect(describeError(messages.en, new Error('boom'))).toBe(messages.en.errorUnknown);
    expect(describeError(messages.en, new ApiError(500, 'SOMETHING_ELSE', 'ignored'))).toBe(messages.en.errorUnknown);
  });
});
