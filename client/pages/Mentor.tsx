import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdviceList } from './advice';
import { useLocale } from '../locale';
import { completeMentorReview, getMentorSubmission, listMentorSubmissions, saveMentorDraft, type MentorQueueItem, type MentorReviewState, type MentorSubmissionDetail } from '../mentor';
import type { ReviewFeedback, StoredAiFeedback } from '../simulations';
import { ApiError } from '../api';

/** Phase 6 UI — the mentor's view. The queue lists only what the server
 *  already scoped to this mentor's assignments; the review page reuses the
 *  learner's evidence shape (`Evidence`) so both audiences read the same facts,
 *  and adds the two mentor-owned pieces: their own feedback and the learner's
 *  cached AI feedback, which is displayed read-only and can never be generated
 *  from here. */

const statusLabelKeys = {
  NONE: 'mentorNotReviewed',
  DRAFT: 'mentorDraft',
  COMPLETED: 'mentorCompleted',
} as const;

function reviewStatusLabel(status: MentorQueueItem['reviewStatus']): 'mentorNotReviewed' | 'mentorDraft' | 'mentorCompleted' {
  return statusLabelKeys[status];
}

export function MentorQueue() {
  const { t, locale } = useLocale();
  // Load-key pattern (see Dashboard): the stored key decides freshness, so a
  // language switch shows a loading state without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ key: string; submissions: MentorQueueItem[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const submissions = loaded?.key === locale ? loaded.submissions : null;
  const failed = failedFor === locale;

  useEffect(() => {
    let active = true;
    listMentorSubmissions(locale)
      .then((data) => { if (active) setLoaded({ key: locale, submissions: data.submissions }); })
      .catch(() => { if (active) setFailedFor(locale); });
    return () => { active = false; };
  }, [locale]);

  return (
    <section className="dashboard container page-pad" aria-labelledby="mentor-queue-title">
      <p className="eyebrow">{t.mentorTitle}</p>
      <h1 id="mentor-queue-title">{t.mentorQueueTitle}</h1>
      <p className="muted">{t.mentorQueueIntro}</p>

      {failed && <p className="form-error" role="alert">{t.errorNetwork}</p>}

      {submissions !== null && (
        submissions.length === 0 ? (
          <p className="muted">{t.mentorQueueEmpty}</p>
        ) : (
          <ul className="attempt-list">
            {submissions.map((item) => (
              <li key={item.id} className="attempt-row">
                <div>
                  <b>{item.simulation.title}</b>
                  <p className="muted">
                    {item.learner.name} · {item.simulation.company} · {t.evidenceSubmittedOn}{' '}
                    {new Date(item.submittedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')} ·{' '}
                    {t.dashboardScore}{' '}
                    {item.score ? `${item.score.score}/${item.score.maxScore}` : '—'} ·{' '}
                    {t[reviewStatusLabel(item.reviewStatus)]}
                  </p>
                </div>
                <Link className="button button-small" to={`/mentor/${item.id}`}>{t.mentorOpenReview}</Link>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

/** Mentor's own feedback editor. "Save draft" never demotes a completed
 *  review (the server preserves the lifecycle status); "Complete review" is
 *  disabled until there is text, because the server rejects empty completion. */
function MentorReviewEditor({ submissionId, initial, onSaved }: {
  submissionId: string;
  initial: MentorReviewState | null;
  onSaved: (review: MentorReviewState) => void;
}) {
  const { t } = useLocale();
  const [feedback, setFeedback] = useState(initial?.feedback ?? '');
  const [status, setStatus] = useState<MentorReviewState['status'] | null>(initial?.status ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ review: MentorReviewState }>) {
    setPending(true);
    setError(null);
    try {
      const data = await action();
      setStatus(data.review.status);
      onSaved(data.review);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.errorUnknown);
    } finally {
      setPending(false);
    }
  }

  const hasText = feedback.trim().length > 0;
  const completed = status === 'COMPLETED';

  return (
    <section className="ai-section" aria-labelledby="mentor-review-title">
      <h2 id="mentor-review-title">{t.mentorReviewTitle}</h2>
      <p className="muted">{t.mentorReviewIntro}</p>
      {completed && <p className="muted"><b>{t.mentorCompleted}</b></p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="mentor-feedback">{t.mentorFeedbackLabel}</label>
        <textarea
          id="mentor-feedback"
          dir="auto"
          rows={6}
          maxLength={4000}
          value={feedback}
          placeholder={t.mentorFeedbackPlaceholder}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </div>
      <div className="workspace-actions">
        <button
          className="button button-small"
          disabled={pending || !hasText}
          onClick={() => { void run(() => saveMentorDraft(submissionId, feedback)); }}
        >
          {pending ? t.workspaceSaving : t.mentorSaveDraft}
        </button>
        <button
          className="button button-small"
          disabled={pending || !hasText || completed}
          onClick={() => { void run(() => completeMentorReview(submissionId, feedback)); }}
        >
          {t.mentorCompleteReview}
        </button>
      </div>
    </section>
  );
}


/** The learner's cached AI feedback, read-only. A missing or failed generation
 *  is simply "none": mentors cannot trigger the provider from here. */
function MentorAiSection({ aiReview }: { aiReview: StoredAiFeedback<ReviewFeedback> | null }) {
  const { t } = useLocale();
  const ready = aiReview?.status === 'READY' ? aiReview.feedback : null;
  return (
    <section className="ai-section" aria-labelledby="mentor-ai-title">
      <h2 id="mentor-ai-title">{t.mentorAiTitle}</h2>
      {ready ? (
        <div className="ai-ready">
          <AdviceList title={t.aiStrengths} items={ready.strengths} />
          <AdviceList title={t.aiImprove} items={ready.areas_to_improve} />
          <AdviceList title={t.aiActions} items={ready.actionable_recommendations} />
          <div className="advice-block">
            <h4>{t.aiSummary}</h4>
            <p>{ready.explanation}</p>
          </div>
        </div>
            ) : (
                <p className="muted">{t.mentorAiNone}</p>
      )}
    </section>
  );
}


export function MentorReviewPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, locale } = useLocale();
  // Load-key pattern: see Catalog. Keeps evidence from leaking across
  // navigations while the next submission is still loading.
  const [loaded, setLoaded] = useState<{ key: string; detail: MentorSubmissionDetail } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // The saved review, mirrored out of the detail so the editor's onSaved can
  // keep it current without a refetch.
  const [review, setReview] = useState<MentorReviewState | null>(null);

  const loadKey = `${locale}:${submissionId ?? ''}`;
  const detail = loaded?.key === loadKey ? loaded.detail : null;
  const failed = failedFor === loadKey;

  useEffect(() => {
    if (!submissionId) return undefined;
    let active = true;
    getMentorSubmission(submissionId, locale)
      .then((data) => {
        if (!active) return;
        setLoaded({ key: loadKey, detail: data });
        setReview(data.review);
      })
      .catch(() => { if (active) setFailedFor(loadKey); });
    return () => { active = false; };
  }, [submissionId, locale, loadKey]);

  if (failed) {
    return (
      <section className="container page-pad">
        <p className="form-error" role="alert">{t.errorNetwork}</p>
        <Link className="nav-link" to="/mentor">{t.mentorBackToQueue}</Link>
      </section>
    );
  }
  if (!detail) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  const evaluation = detail.evidence.evaluation;
    return (
    <section className="evidence container page-pad" aria-labelledby="mentor-detail-title">
      <p className="eyebrow">{t.mentorTitle}</p>
      <h1 id="mentor-detail-title">{detail.evidence.simulation.title}</h1>
      <p className="muted">
        {detail.evidence.learner.name} · {detail.evidence.simulation.company} · {detail.evidence.simulation.roleTitle} ·{' '}
        {t.evidenceSubmittedOn} {new Date(detail.evidence.submittedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
      </p>

      <div className="evidence-grid">
        <div className="evidence-main">
          <h2>{t.evidenceScoreTitle}</h2>
          {evaluation && (
            <>
              <p className="score-line">
                <b className="score">{evaluation.score}/{evaluation.maxScore}</b>
                <span className="muted"> ({evaluation.percent}%)</span>
              </p>
              <h3>{t.evidenceCriteriaTitle}</h3>
              <ul className="criteria">
                {evaluation.criteria.map((criterion) => (
                  <li key={criterion.key} className={criterion.skipped ? 'criterion skipped' : criterion.met ? 'criterion met' : 'criterion missed'}>
                    <span className="mark" aria-hidden="true">{criterion.skipped ? '—' : criterion.met ? '✓' : '✕'}</span>
                    <div>
                      <p className="criterion-label">
                        {criterion.label}{' '}
                        <span className="muted">({criterion.weight})</span>
                        {criterion.skipped && <span className="muted"> · {t.evidenceSkipped}</span>}
                      </p>
                      <p className="muted criterion-evidence">{criterion.evidence}</p>
                      {criterion.skipped && <p className="muted criterion-evidence">{t.evidenceSkippedNote}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="preview-note">{t.evidenceDisclaimer}</p>
            </>
          )}

          <MentorAiSection aiReview={detail.aiReview} />

          <h2>{t.evidenceSkillsTitle}</h2>
          {detail.evidence.skills.length === 0 ? (
            <p className="muted">{t.evidenceSkillsEmpty}</p>
          ) : (
            <ul className="skill-list">
              {detail.evidence.skills.map((skill) => (
                <li key={skill.slug}><b>{skill.name}</b> — <span className="muted">{skill.basis}</span></li>
              ))}
            </ul>
          )}

          <h2>{t.evidenceWorkTitle}</h2>
          <dl className="work-fields">
            {detail.evidence.work.map((field) => (
              <div key={field.key} className="work-field">
                <dt>{field.label}</dt>
                <dd>{field.kind === 'code' ? <pre dir="ltr"><code>{field.value}</code></pre> : field.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="evidence-side">
          <h2>{t.evidenceTimelineTitle}</h2>
          {detail.evidence.timeline.length === 0 ? (
            <p className="muted">{t.workspaceInboxEmpty}</p>
          ) : (
            <ul className="inbox">
              {detail.evidence.timeline.map((entry) => (
                <li key={entry.key} className="inbox-item">
                  <p className="inbox-meta">
                    <b>{entry.title}</b> · <span className="muted">+{entry.minutesAfterStart} {t.minutesSuffix}</span>
                  </p>
                  <p className="inbox-body">{entry.body}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Re-keyed per locale+submission so a language switch reloads the saved
          text from the server instead of keeping a half-translated local edit. */}
      <MentorReviewEditor
        key={`${locale}:${detail.evidence.id}`}
        submissionId={detail.evidence.id}
        initial={review}
        onSaved={setReview}
      />

      
      <Link className="nav-link" to="/mentor">← {t.mentorBackToQueue}</Link>
    </section>
  );
}

