import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLocale, type MessageKey } from '../locale';
import { generateCoachReport, listAttempts, readCoachReport, type CoachResult, type AttemptSummary } from '../simulations';
import { AdviceList } from './advice';

/** Server roles are uppercase codes; the UI shows localized names, with the
 *  raw code as a safe fallback for any future role. */
const roleKeyByRole: Record<string, MessageKey> = {
  LEARNER: 'roleLearner',
  MENTOR: 'roleMentor',
  EMPLOYER: 'roleEmployer',
  ADMIN: 'roleAdmin',
};

/** Feature B UI — Career/Skill Coach. Reads the cached report on mount (no
 *  provider call); generation happens only when the learner asks for it. The
 *  three states map to real server outcomes: no report yet, not enough
 *  completed evidence, or an advisory failure that never affects the dashboard. */
function CoachSection({ completedCount }: { completedCount: number }) {
  const { t, locale } = useLocale();
  // Load-key pattern (see Catalog): the stored key decides freshness, so a
  // language switch shows a loading state without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ key: string; result: CoachResult | null | 'error' } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    readCoachReport(locale)
      .then((data) => { if (active) setLoaded({ key: locale, result: data.report }); })
      .catch(() => { if (active) setLoaded({ key: locale, result: 'error' }); });
    return () => { active = false; };
  }, [locale]);

  async function handleGenerate() {
    setPending(true);
    try {
      const data = await generateCoachReport(locale);
      setLoaded({ key: locale, result: data.report });
    } catch {
      setLoaded({ key: locale, result: { status: 'UNAVAILABLE', feedback: null, failureCode: 'AI_PROVIDER_ERROR', model: null, completedAt: null } });
    } finally {
      setPending(false);
    }
  }

  // 'loading' while this locale's cached read is in flight. The isDone alias
  // also excludes null, so later `report.status` reads narrow to CoachResult.
  const report: CoachResult | null | 'loading' | 'error' = loaded?.key === locale ? loaded.result : 'loading';
  const isDone = report !== null && report !== 'loading' && report !== 'error';
  const feedback = isDone && report.status === 'READY' ? report.feedback : null;

  return (
    <section className="coach card-section" aria-labelledby="coach-title">
      <h2 id="coach-title">{t.coachTitle}</h2>
      <p className="muted">{t.coachIntro}</p>

      {feedback && (
        <div className="ai-ready">
          <AdviceList title={t.coachStrengths} items={feedback.demonstrated_strengths} />
          <AdviceList title={t.coachGaps} items={feedback.skills_to_improve} />
          <AdviceList title={t.coachNextSkills} items={feedback.recommended_next_skills} />
          <div className="advice-block">
            <h4>{t.coachNextSimulation}</h4>
            <p><Link className="inline-link" to={`/simulations/${feedback.recommended_next_simulation}`}>{t.coachOpen}</Link></p>
          </div>
          <div className="advice-block">
            <h4>{t.coachReasoning}</h4>
            <p>{feedback.reasoning}</p>
          </div>
        </div>
      )}

      {isDone && report.status === 'INSUFFICIENT_EVIDENCE' && (
        <div className="ai-fallback">
          <p><b>{t.coachInsufficientTitle}</b> — {t.coachInsufficient}</p>
        </div>
      )}

      {isDone && report.status === 'UNAVAILABLE' && (
        <div className="ai-fallback">
          <p>{t.aiUnavailable}</p>
          <button className="button button-small" onClick={() => { void handleGenerate(); }} disabled={pending}>
            {pending ? t.coachGenerating : t.coachRegenerate}
          </button>
        </div>
      )}

      {report === null && (
        <div className="ai-fallback">
          {completedCount < 2 ? (
            <p><b>{t.coachInsufficientTitle}</b> — {t.coachInsufficient}</p>
          ) : (
            <button className="button button-small" onClick={() => { void handleGenerate(); }} disabled={pending}>
              {pending ? t.coachGenerating : t.coachGenerate}
            </button>
          )}
        </div>
      )}

      {report === 'loading' && <p className="muted" aria-live="polite">{t.loadingSection}</p>}
      {report === 'error' && <p className="muted">{t.errorNetwork}</p>}
    </section>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  // Load-key pattern: see Catalog.
  const [loaded, setLoaded] = useState<{ key: string; attempts: AttemptSummary[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const attempts = loaded?.key === locale ? loaded.attempts : null;
  const failed = failedFor === locale;

  useEffect(() => {
    let active = true;
    listAttempts(locale)
      .then((data) => { if (active) setLoaded({ key: locale, attempts: data.attempts }); })
      .catch(() => { if (active) setFailedFor(locale); });
    return () => { active = false; };
  }, [locale]);

  if (!user) return null; // RequireAuth guarantees a user; this satisfies TS.
  const roleKey = roleKeyByRole[user.role];
  const inProgress = (attempts ?? []).filter((attempt) => attempt.status === 'ACTIVE');
  const completed = (attempts ?? []).filter((attempt) => attempt.status !== 'ACTIVE');

  return (
    <section className="dashboard container page-pad" aria-labelledby="dashboard-title">
      <p className="eyebrow">{t.dashboardTitle}</p>
      <h1 id="dashboard-title">{t.dashboardGreeting} {user.name}</h1>
      <p className="muted">{roleKey ? t[roleKey] : user.role}</p>

      {failed && <p className="form-error" role="alert">{t.errorNetwork}</p>}

      {attempts !== null && (
        <>
          <h2>{t.dashboardInProgress}</h2>
          {inProgress.length === 0 ? (
            <p className="muted">{t.dashboardNoWork}</p>
          ) : (
            <ul className="attempt-list">
              {inProgress.map((attempt) => (
                <li key={attempt.id} className="attempt-row">
                  <div>
                    <b>{attempt.simulation.title}</b>
                    <p className="muted">{attempt.simulation.company} · {attempt.simulation.roleTitle} · {t.dashboardStarted} {new Date(attempt.startedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}</p>
                  </div>
                  <Link className="button button-small" to={`/workspace/${attempt.id}`}>{t.dashboardResume}</Link>
                </li>
              ))}
            </ul>
          )}

          <h2>{t.dashboardCompleted}</h2>
          {completed.length === 0 ? (
            <p className="muted">{t.dashboardNoWork}</p>
          ) : (
            <ul className="attempt-list">
              {completed.map((attempt) => (
                <li key={attempt.id} className="attempt-row">
                  <div>
                    <b>{attempt.simulation.title}</b>
                    <p className="muted">
                      {attempt.simulation.company} · {t.dashboardScore}{' '}
                      {attempt.score ? `${attempt.score.score}/${attempt.score.maxScore}` : '—'}
                      {attempt.skills.length > 0 && <> · {attempt.skills.join(' · ')}</>}
                    </p>
                  </div>
                  {attempt.submissionId && (
                    <Link className="button button-small" to={`/evidence/${attempt.submissionId}`}>{t.dashboardReview}</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {attempts !== null && !failed && <CoachSection completedCount={completed.length} />}

      <div className="dashboard-empty">
        <h2>{t.dashboardBrowse}</h2>
        <p>{t.dashboardEvidenceNote}</p>
        <Link className="button button-small" to="/simulations">{t.dashboardBrowse}</Link>
      </div>
    </section>
  );
}

