import { z } from 'zod';

/** Response contracts for the two AI features. Validation happens server-side
 *  before anything is stored; an invalid AI answer is treated as "unavailable",
 *  never as truth. String arrays are capped so a runaway model cannot bloat the
 *  database or the UI. */

const maxItems = 6;
const cappedStrings = z.array(z.string().trim().min(1).max(500)).max(maxItems);

/** Feature A — Submission Reviewer. The AI never returns a score: the
 *  deterministic evaluation stays the single source of objective truth, which
 *  is why no numeric field exists in this schema at all. */
export const reviewSchema = z.object({
  strengths: cappedStrings,
  areas_to_improve: cappedStrings,
  actionable_recommendations: cappedStrings,
  explanation: z.string().trim().min(1).max(2000),
});

export type ReviewFeedback = z.infer<typeof reviewSchema>;

/** Feature B — Career/Skill Coach. `recommended_next_simulation` must be one of
 *  the slugs we supplied in the prompt context; anything else is rejected, so
 *  the model cannot invent a simulation that does not exist. */
export const coachSchema = z.object({
  demonstrated_strengths: cappedStrings,
  skills_to_improve: cappedStrings,
  recommended_next_skills: cappedStrings,
  recommended_next_simulation: z.string().trim().min(1).max(80),
  reasoning: z.string().trim().min(1).max(2000),
});

export type CoachFeedback = z.infer<typeof coachSchema>;

/** Bumped whenever a prompt materially changes, so stored feedback records can
 *  be traced to the prompt that produced them. */
export const REVIEW_PROMPT_VERSION = 'review-v1';
export const COACH_PROMPT_VERSION = 'coach-v1';

/** Upper bound for model output passed to the provider. */
export const REVIEW_MAX_OUTPUT_CHARS = 4000;
export const COACH_MAX_OUTPUT_CHARS = 3000;
