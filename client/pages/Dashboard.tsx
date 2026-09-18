import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLocale, type MessageKey } from '../locale';
import { listAttempts, type AttemptSummary } from '../simulations';

/** Server roles are uppercase codes; the UI shows localized names, with the
 *  raw code as a safe fallback for any future role. */
const roleKeyByRole: Record<string, MessageKey> = {
  LEARNER: 'roleLearner',
  MENTOR: 'roleMentor',
  EMPLOYER: 'roleEmployer',
  ADMIN: 'roleAdmin',
};

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

      <div className="dashboard-empty">
        <h2>{t.dashboardBrowse}</h2>
        <p>{t.dashboardEvidenceNote}</p>
        <Link className="button button-small" to="/simulations">{t.dashboardBrowse}</Link>
      </div>
    </section>
  );
}

