import { describe, expect, it } from 'vitest';
import { parseAiJson } from './parse.js';

/** Real model behaviour drove this file: Gemini answers the review prompt
 *  correctly but wraps the object in a markdown fence, which made the whole
 *  feature report "unavailable". These tests pin the normalization so that
 *  cannot silently regress. */
describe('parseAiJson', () => {
  const payload = { strengths: ['clear diagnosis'], areas_to_improve: [], actionable_recommendations: [], explanation: 'ok' };

  it('accepts raw JSON exactly as asked for', () => {
    expect(parseAiJson(JSON.stringify(payload))).toEqual(payload);
  });

  it('accepts JSON wrapped in a markdown fence', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    expect(parseAiJson(fenced)).toEqual(payload);
  });

  it('accepts a fence without a language tag or closing fence', () => {
    expect(parseAiJson(`\`\`\`\n${JSON.stringify(payload)}`)).toEqual(payload);
  });

  it('accepts prose around the object', () => {
    expect(parseAiJson(`Here is my review:\n${JSON.stringify(payload)}\nLet me know if you need more.`)).toEqual(payload);
  });

  it('returns undefined for output that contains no JSON object', () => {
    expect(parseAiJson('I am not able to review this submission.')).toBeUndefined();
  });

  it('returns undefined rather than guessing at broken JSON', () => {
    expect(parseAiJson('{"strengths": ["a", }')).toBeUndefined();
    expect(parseAiJson('')).toBeUndefined();
  });

  it('never repairs content: the value still has to satisfy the schema', () => {
    // A well-formed object with the wrong shape stays a wrong shape.
    expect(parseAiJson('```json\n{"score": 95}\n```')).toEqual({ score: 95 });
  });
});