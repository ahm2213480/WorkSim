/** Turns untrusted model output into a value the schema can validate.
 *
 *  Why this exists: the model is asked for raw JSON, and in practice it often
 *  wraps that JSON in a markdown fence (```json ... ```) or adds a sentence of
 *  prose around it. That is a formatting habit, not a wrong answer, so we
 *  normalize it before validating instead of throwing the feedback away.
 *
 *  This only *locates* JSON — it never repairs, guesses or trusts content.
 *  Whatever comes out still has to pass the zod schema in schemas.ts, and
 *  `undefined` (all three attempts failed) is treated as "AI unavailable".
 *
 *  Deliberately dependency-free: this is a dozen lines a junior developer can
 *  read top to bottom. */
export function parseAiJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. The model already answered exactly what we asked for.
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  // 2. Strip a single markdown code fence, with or without a language tag, and
  //    with a missing closing fence (models sometimes get cut off).
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/.exec(trimmed);
  const inner = fenced?.[1];
  if (inner !== undefined) {
    const parsedInner = tryParse(inner.trim());
    if (parsedInner !== undefined) return parsedInner;
  }

  // 3. Fall back to the widest brace-delimited slice, which tolerates prose
  //    before/after the object ("Here is the feedback: { ... }").
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = tryParse(trimmed.slice(start, end + 1));
    if (sliced !== undefined) return sliced;
  }

  return undefined;
}

function tryParse(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}