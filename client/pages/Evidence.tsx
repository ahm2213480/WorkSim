import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AdviceList } from './advice';
import { useLocale } from '../locale';
import { generateReview, getSubmission, readReview, type Evidence, type MentorFeedbackView, type ReviewFeedback, type StoredAiFeedback } from '../simulations';

/** Feature A UI. The deterministic evaluation above is the score of record;
 *  this section is advisory only, and its failure states never block access to
 *  the saved submission. Generation happens on explicit request (or once via
 *  the ?ai=1 handoff right after submitting) and is cached server-side. */
function AiReviewSection({ submissionId }: { submissionId: string }) {
  const { t, locale } = useLocale();
  const [review, setReview] = useState<StoredAiFeedback<ReviewFeedback> | null>(null);
  const [pending, setPending] = useState(true); // The cached read is in flight on mount.
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    // Cached read first (no provider call); then, only when the learner just
    // submitted (?ai=1), generate immediately so the feedback is ready here.
    readReview(submissionId, locale)
      .then(async (data) => {
        if (!active) return;
        if (data.review) setReview(data.review);
        else if (searchParams.get('ai') === '1') {
          setPending(true);
          const generated = await generateReview(submissionId, locale);
          if (active) setReview(generated.review);
        }
      })
      .catch(() => { /* reads degrade to the generate button below */ })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams is read once per mount
  }, [submissionId, locale]);

  async function handleGenerate() {
    setPending(true);
    try {
      const generated = await generateReview(submissionId, locale);
      setReview(generated.review);
    } catch {
      setReview({ status: 'UNAVAILABLE', feedback: null, failureCode: 'AI_PROVIDER_ERROR', model: null, completedAt: null });
    } finally {
      setPending(false);
    }
  }

  const ready = review?.status === 'READY' ? review.feedback : null;

  return (
    <section className="ai-section" aria-labelledby="ai-feedback-title">
      <h2 id="ai-feedback-title">{t.aiFeedbackTitle}</h2>
      <p className="muted">{t.aiAdvisory}</p>

      {ready && (
        <div className="ai-ready">
          <AdviceList title={t.aiStrengths} items={ready.strengths} />
          <AdviceList title={t.aiImprove} items={ready.areas_to_improve} />
          <AdviceList title={t.aiActions} items={ready.actionable_recommendations} />
          <div className="advice-block">
            <h4>{t.aiSummary}</h4>
            <p>{ready.explanation}</p>
          </div>
        </div>
      )}

      {!ready && pending && <p className="muted" aria-live="polite">{t.aiGenerating}</p>}

      {!ready && !pending && (
        <div className="ai-fallback">
          <p>{t.aiUnavailable}</p>
          <button className="button button-small" onClick={() => { void handleGenerate(); }}>{t.aiRegenerate}</button>
        </div>
      )}
    </section>
  );
}

/** Work evidence: what the learner actually did, how they did it, and how it
 *  was scored. The deterministic evaluation is shown with per-criterion
 *  evidence (and the disclaimer that it measures completeness, not quality) so
 *  the score stays explainable rather than magic. */
export function EvidencePage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, locale } = useLocale();
  // Load-key pattern: see Catalog. The stored key keeps evidence from leaking
  // across navigations while the next submission is still loading.
  const [loaded, setLoaded] = useState<{ key: string; evidence: Evidence; mentorFeedback: MentorFeedbackView | null } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const loadKey = `${locale}:${submissionId ?? ''}`;
  const fresh = loaded?.key === loadKey ? loaded : null;
  const evidence = fresh?.evidence ?? null;
  const mentorFeedback = fresh?.mentorFeedback ?? null;
  const failed = failedFor === loadKey;

  useEffect(() => {
    if (!submissionId) return undefined;
    let active = true;
    getSubmission(submissionId, locale)
      .then((data) => { if (active) setLoaded({ key: loadKey, evidence: data.evidence, mentorFeedback: data.mentorFeedback ?? null }); })
      .catch(() => { if (active) setFailedFor(loadKey); });
    return () => { active = false; };
  }, [submissionId, locale, loadKey]);

  if (failed) {
    return (
      <section className="container page-pad">
        <p className="form-error" role="alert">{t.errorNetwork}</p>
        <Link className="nav-link" to="/dashboard">{t.evidenceBack}</Link>
      </section>
    );
  }
  if (!evidence) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  const evaluation = evidence.evaluation;
  return (
    <section className="evidence container page-pad" aria-labelledby="evidence-title">
      <p className="eyebrow">{t.evidenceTitle}</p>
      <h1 id="evidence-title">{evidence.simulation.title}</h1>
      <p className="muted">
        {evidence.simulation.company} · {evidence.simulation.roleTitle} · {t.evidenceSubmittedOn}{' '}
        {new Date(evidence.submittedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
      </p>

      <div className="evidence-grid">
        <div className="evidence-main">
          <h2>{t.evidenceScoreTitle}</h2>
          {evaluation ? (
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
          ) : (
            <p className="muted">{t.evidenceSkillsEmpty}</p>
          )}

          <AiReviewSection submissionId={evidence.id} />

          {/* The human review. Pending state while the mentor has not completed
              one yet; reviewer name + feedback once it exists. */}
          <section className="ai-section" aria-labelledby="mentor-feedback-title">
            <h2 id="mentor-feedback-title">{t.learnerMentorTitle}</h2>
            {mentorFeedback ? (
              <div className="advice-block">
                <p>{mentorFeedback.feedback}</p>
                <p className="muted">
                  <b>{mentorFeedback.reviewerName}</b> · {t.mentorCompleted} ·{' '}
                  {new Date(mentorFeedback.completedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}
                </p>
              </div>
            ) : (
              <p className="mentor-pending" role="status"><span className="badge" aria-hidden="true">⏳</span> {t.learnerMentorPending}</p>
            )}
            <p className="muted">{t.learnerMentorNote}</p>
          </section>

          <h2>{t.evidenceSkillsTitle}</h2>
          {evidence.skills.length === 0 ? (
            <p className="muted">{t.evidenceSkillsEmpty}</p>
          ) : (
            <ul className="skill-list">
              {evidence.skills.map((skill) => (
                <li key={skill.slug}><b>{skill.name}</b> — <span className="muted">{skill.basis}</span></li>
              ))}
            </ul>
          )}

          <h2>{t.evidenceWorkTitle}</h2>
          <dl className="work-fields">
            {evidence.work.map((field) => (
              <div key={field.key} className="work-field">
                <dt>{field.label}</dt>
                <dd>{field.kind === 'code' ? <pre dir="ltr"><code>{field.value}</code></pre> : field.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="evidence-side">
          <h2>{t.evidenceTimelineTitle}</h2>
          {evidence.timeline.length === 0 ? (
            <p className="muted">{t.workspaceInboxEmpty}</p>
          ) : (
            <ul className="inbox">
              {evidence.timeline.map((entry) => (
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

      <Link className="nav-link" to="/dashboard">← {t.evidenceBack}</Link>
    </section>
  );
}
