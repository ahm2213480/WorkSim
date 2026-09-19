import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdviceList } from './advice';
import { useLocale } from '../locale';
import { getEmployerEvidence, listEmployerEvidence, type EmployerEvidenceDetail, type EmployerEvidenceItem } from '../employer';
import type { ReviewFeedback, StoredAiFeedback } from '../simulations';
import { ApiError } from '../api';
import { NotFound } from './NotFound';

/** Phase 7 UI — the employer's view. Strictly read-only: the queue lists only
 *  what the server already scoped to this employer's active evidence grants,
 *  and the detail page reuses the learner evidence shape (`Evidence`) so every
 *  audience reads the same facts. The two advisory sections (AI feedback and
 *  completed mentor feedback) are displayed as context only — neither can be
 *  generated, edited or deleted from here, and neither changes the platform's
 *  deterministic evaluation. */

/** The learner's cached AI feedback, read-only. A missing or failed generation
 *  is simply "none": employers cannot trigger the provider from here. */
function EmployerAiSection({ aiReview }: { aiReview: StoredAiFeedback<ReviewFeedback> | null }) {
  const { t } = useLocale();
  const ready = aiReview?.status === 'READY' ? aiReview.feedback : null;
  return (
    <section className="ai-section" aria-labelledby="employer-ai-title">
      <h2 id="employer-ai-title">{t.employerAiTitle}</h2>
      <p className="muted">{t.employerAiAdvisory}</p>
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
        <p className="muted">{t.employerAiNone}</p>
      )}
    </section>
  );
}

export function EmployerEvidenceList() {
  const { t, locale } = useLocale();
  // Load-key pattern (see MentorQueue): the stored key decides freshness, so a
  // language switch shows a loading state without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ key: string; submissions: EmployerEvidenceItem[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const submissions = loaded?.key === locale ? loaded.submissions : null;
  const failed = failedFor === locale;

  useEffect(() => {
    let active = true;
    listEmployerEvidence(locale)
      .then((data) => { if (active) setLoaded({ key: locale, submissions: data.submissions }); })
      .catch(() => { if (active) setFailedFor(locale); });
    return () => { active = false; };
  }, [locale]);

  return (
    <section className="dashboard container page-pad" aria-labelledby="employer-list-title">
      <p className="eyebrow">{t.employerTitle}</p>
      <h1 id="employer-list-title">{t.employerListTitle}</h1>
      <p className="muted">{t.employerListIntro}</p>

      {failed && <p className="form-error" role="alert">{t.errorNetwork}</p>}

      {submissions !== null && (
        submissions.length === 0 ? (
          <p className="muted">{t.employerListEmpty}</p>
        ) : (
          <ul className="attempt-list">
            {submissions.map((item) => (
              <li key={item.id} className="attempt-row">
                <div>
                  <b>{item.learner.name}</b>
                  <p className="muted">
                    {item.simulation.company} · {item.simulation.roleTitle} · {item.simulation.title} ·{' '}
                    {t.evidenceSubmittedOn} {new Date(item.submittedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')} ·{' '}
                    {t.dashboardScore}{' '}
                    {item.score ? `${item.score.score}/${item.score.maxScore}` : '—'} ·{' '}
                    {t[item.mentorReview === 'COMPLETED' ? 'employerReviewCompleted' : 'employerReviewPending']}
                  </p>
                  {item.skills.length > 0 && <p className="muted">{item.skills.join(' · ')}</p>}
                </div>
                <Link className="button button-small" to={`/employer/evidence/${item.id}`}>{t.employerOpenEvidence}</Link>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

export function EmployerEvidencePage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, locale } = useLocale();
  // Load-key pattern: see MentorReviewPage. Keeps evidence from leaking across
  // navigations while the next submission is still loading.
  const [loaded, setLoaded] = useState<{ key: string; detail: EmployerEvidenceDetail } | null>(null);
  const [failure, setFailure] = useState<{ key: string; status: number } | null>(null);

  const loadKey = `${locale}:${submissionId ?? ''}`;
  const detail = loaded?.key === loadKey ? loaded.detail : null;
  const failed = failure?.key === loadKey;
  // A 404 means the evidence does not exist or was not shared with this
  // employer — one message for both, exactly like the server's response.
  const notFound = failed && failure.status === 404;

  useEffect(() => {
    if (!submissionId) return undefined;
    let active = true;
    getEmployerEvidence(submissionId, locale)
      .then((data) => { if (active) setLoaded({ key: loadKey, detail: data }); })
      .catch((caught) => { if (active) setFailure({ key: loadKey, status: caught instanceof ApiError ? caught.status : 0 }); });
    return () => { active = false; };
  }, [submissionId, locale, loadKey]);

  if (!submissionId) return <NotFound />;
  if (failed) {
    return (
      <section className="container page-pad">
        <p className="form-error" role="alert">{notFound ? t.notFoundText : t.errorNetwork}</p>
        <Link className="nav-link" to="/employer">← {t.employerBackToList}</Link>
      </section>
    );
  }
  if (!detail) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  const evidence = detail.evidence;
  const evaluation = evidence.evaluation;

  return (
    <section className="evidence container page-pad" aria-labelledby="employer-detail-title">
      <p className="eyebrow">{t.employerTitle}</p>
      <h1 id="employer-detail-title">{evidence.learner.name}</h1>
      <p className="muted">
        {evidence.simulation.company} · {evidence.simulation.roleTitle} · {evidence.simulation.title} ·{' '}
        {t.evidenceSubmittedOn} {new Date(evidence.submittedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
      </p>
      <p className="preview-note">{t.employerConsentNote}</p>

      <div className="evidence-grid">
        <div className="evidence-main">
          <h2>{t.employerCandidateTitle}</h2>
          <dl className="work-fields">
            <div className="work-field">
              <dt>{t.employerCandidateTitle}</dt>
              <dd>{evidence.learner.name}</dd>
            </div>
            <div className="work-field">
              <dt>{t.dashboardStarted}</dt>
              <dd>{new Date(evidence.startedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}</dd>
            </div>
          </dl>

          <h2>{t.employerTaskTitle}</h2>
          <p><b>{evidence.task.title}</b></p>
          <p className="muted">{evidence.task.instructions}</p>

          <h2>{t.evidenceWorkTitle}</h2>
          <dl className="work-fields">
            {evidence.work.map((field) => (
              <div key={field.key} className="work-field">
                <dt>{field.label}</dt>
                <dd>{field.kind === 'code' ? <pre dir="ltr"><code>{field.value}</code></pre> : field.value}</dd>
              </div>
            ))}
          </dl>
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
                    </div>
                  </li>
                ))}
              </ul>
              <p className="preview-note">{t.evidenceDisclaimer}</p>
            </>
          )}

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

          <EmployerAiSection aiReview={detail.aiReview} />

          <section className="ai-section" aria-labelledby="employer-mentor-title">
            <h2 id="employer-mentor-title">{t.employerMentorFeedbackTitle}</h2>
            {detail.review ? (
              <div className="advice-block">
                <p>{detail.review.feedback}</p>
                <p className="muted">{t.mentorCompleted} · {new Date(detail.review.completedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}</p>
              </div>
            ) : (
              <p className="muted">{t.employerMentorFeedbackNone}</p>
            )}
          </section>
        </div>

        <aside className="evidence-side">
          <h2>{t.employerTimelineTitle}</h2>
          {evidence.timeline.length === 0 ? (
            <p className="muted">{t.employerTimelineNone}</p>
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

      <Link className="nav-link" to="/employer">← {t.employerBackToList}</Link>
    </section>
  );
}


