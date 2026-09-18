import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocale } from '../locale';
import { getSubmission, type Evidence } from '../simulations';

/** Work evidence: what the learner actually did, how they did it, and how it
 *  was scored. The deterministic evaluation is shown with per-criterion
 *  evidence (and the disclaimer that it measures completeness, not quality) so
 *  the score stays explainable rather than magic. */
export function EvidencePage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, locale } = useLocale();
  // Load-key pattern: see Catalog. The stored key keeps evidence from leaking
  // across navigations while the next submission is still loading.
  const [loaded, setLoaded] = useState<{ key: string; evidence: Evidence } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const loadKey = `${locale}:${submissionId ?? ''}`;
  const evidence = loaded?.key === loadKey ? loaded.evidence : null;
  const failed = failedFor === loadKey;

  useEffect(() => {
    if (!submissionId) return undefined;
    let active = true;
    getSubmission(submissionId, locale)
      .then((data) => { if (active) setLoaded({ key: loadKey, evidence: data.evidence }); })
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
