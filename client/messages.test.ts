import { describe, expect, it } from 'vitest';
import { messages } from './messages';

describe('landing localization', () => {
  it('has matching English and Arabic message keys', () => {
    expect(Object.keys(messages.ar).sort()).toEqual(Object.keys(messages.en).sort());
  });
  it('has no empty translations', () => {
    for (const dictionary of Object.values(messages)) {
      for (const text of Object.values(dictionary)) expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});
