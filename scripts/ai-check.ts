import 'dotenv/config';
import { defaultProvider, isAiConfigured, AiUnavailableError, type AiProvider } from '../server/ai/provider.js';
import { parseAiJson } from '../server/ai/parse.js';
import { REVIEW_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT } from '../server/ai/prompts.js';
import { REVIEW_MAX_OUTPUT_CHARS, COACH_MAX_OUTPUT_CHARS, reviewSchema, coachSchema } from '../server/ai/schemas.js';

/** Live connectivity check for the configured AI provider — `npm run ai:check`.
 *
 *  Why it exists: the automated suite injects a fake provider so it never needs
 *  the network. That leaves one question unanswered on a real machine — "is my
 *  key/model/endpoint actually wired up?" This script answers it by calling the
 *  real provider with the real system prompts and validating the real schemas.
 *
 *  Deliberately touches no database and sends no account or learner data: it
 *  uses a short synthetic context, so running it cannot spend tokens on real
 *  submissions or leak anything. It prints no secrets. Exit code 1 means the
 *  AI layer would show "unavailable" in the app.
 *
 *  Usage: npm run ai:check */

const REVIEW_CONTEXT = `Language for your entire JSON answer: "en".

SIMULATION: NovaShop — Junior Frontend Developer
TASK: Fix mobile checkout before Friday's release.
INSTRUCTIONS GIVEN TO THE EMPLOYEE:
Investigate why mobile customers cannot complete checkout, explain the root cause, propose a fix, and give a test plan.

REQUIREMENTS (deterministic check + result — the only objective facts; you must not re-score them):
1. Root-cause write-up [met]
2. Proposed fix (code) [met]
3. Test plan for a teammate [not met]

DELIVERED EVENTS DURING THE TASK (requirements or information the employee received while working):
- [REQUIREMENT_CHANGE] Client clarification: guest checkout must also work on mobile.

THE EMPLOYEE'S SUBMISSION:
--- Root-cause write-up ---
The total is computed from a stale closure, so the first render keeps the previous cart value.
--- Proposed fix (code) ---
Recompute the total in a useEffect keyed on the cart, and guard the pay handler against an empty order.
--- Test plan for a teammate ---
Manually check the mobile sheet at 375px.

Review this submission as a supervisor would. Cite only what appears above.`;

const COACH_CONTEXT = `Language for your entire JSON answer: "en".

COMPLETED SIMULATIONS (2):
- NovaShop — Fix mobile checkout before Friday's release. — result: 78%
  Credited skills: Debugging under ambiguity, Root-cause analysis
- MarketFlow — Explain the sales decline. — result: 64%
  Credited skills: Data storytelling

SKILL AREAS WHERE A REQUIRED RUBRIC CRITERION WAS NOT MET (evidence-backed gaps):
Test planning coverage

AVAILABLE SIMULATIONS FOR RECOMMENDATION (use the slug verbatim in recommended_next_simulation):
- novashop-mobile-checkout: NovaShop — Fix mobile checkout (Junior Frontend Developer; skills: Debugging under ambiguity, Test planning coverage)
- marketflow-sales-decline: MarketFlow — Explain the sales decline (Junior Data Analyst; skills: Data storytelling, Insight prioritisation)

Coach this learner's next steps. Follow the system rules: evidence only, no invented experience, absence of a skill means no evidence yet, and the recommended simulation must be one of the slugs above.`;

interface CheckResult {
  feature: string;
  outcome: 'READY' | 'UNAVAILABLE';
  detail: string;
  preview: string;
}

async function runCheck(
  feature: string,
  provider: AiProvider,
  system: string,
  user: string,
  maxChars: number,
  validate: (value: unknown) => string | null,
): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const completion = await provider.complete(system, user, maxChars);
    const elapsed = Date.now() - startedAt;
    const preview = validate(parseAiJson(completion.content));
    if (preview === null) {
      return { feature, outcome: 'UNAVAILABLE', detail: `${completion.model} · ${elapsed}ms · AI_INVALID_RESPONSE (output did not match the schema)`, preview: '' };
    }
    return { feature, outcome: 'READY', detail: `${completion.model} · ${elapsed}ms · ${completion.content.length} chars`, preview };
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const code = error instanceof AiUnavailableError ? error.code : 'AI_PROVIDER_ERROR';
    const message = error instanceof Error ? error.message : 'unknown error';
    return { feature, outcome: 'UNAVAILABLE', detail: `${code} · ${elapsed}ms · ${message}`, preview: '' };
  }
}

async function main() {
  const provider = defaultProvider();
  console.log(`AI provider: ${provider.describe()}`);
  console.log(`AI configured: ${isAiConfigured() ? 'yes' : 'no (AI_API_KEY is empty — the app still runs and shows "unavailable")'}`);
  console.log('');

  const results = [
    await runCheck('AI Submission Reviewer', provider, REVIEW_SYSTEM_PROMPT, REVIEW_CONTEXT, REVIEW_MAX_OUTPUT_CHARS, (value) => {
      const parsed = reviewSchema.safeParse(value);
      return parsed.success ? `strengths[0]: ${parsed.data.strengths[0] ?? ''}` : null;
    }),
    await runCheck('AI Career/Skill Coach', provider, COACH_SYSTEM_PROMPT, COACH_CONTEXT, COACH_MAX_OUTPUT_CHARS, (value) => {
      const parsed = coachSchema.safeParse(value);
      return parsed.success ? `recommended_next_simulation: ${parsed.data.recommended_next_simulation}` : null;
    }),
  ];

  for (const result of results) {
    console.log(`${result.outcome === 'READY' ? 'OK  ' : 'FAIL'} ${result.feature}`);
    console.log(`     ${result.detail}`);
    if (result.preview) console.log(`     ${result.preview}`);
  }

  const failed = results.filter((result) => result.outcome !== 'READY');
  console.log('');
  console.log(failed.length === 0
    ? 'Both AI features answered with schema-valid structured output.'
    : `${failed.length} AI feature(s) unavailable. Check AI_API_KEY, AI_MODEL and AI_BASE_URL in .env. The rest of the platform is unaffected: submissions, deterministic evaluation and evidence never depend on AI.`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();