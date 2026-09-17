import { useAuth } from '../auth';
import { useLocale, type MessageKey } from '../locale';

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
  const { t } = useLocale();
  if (!user) return null; // RequireAuth guarantees a user; this satisfies TS.
  const roleKey = roleKeyByRole[user.role];
  return (
    <section className="dashboard container page-pad" aria-labelledby="dashboard-title">
      <p className="eyebrow">{t.dashboardTitle}</p>
      <h1 id="dashboard-title">{t.dashboardGreeting} {user.name}</h1>
      <p className="muted">{roleKey ? t[roleKey] : user.role}</p>
      <div className="dashboard-empty">
        <h2>{t.dashboardEmptyTitle}</h2>
        <p>{t.dashboardEmptyText}</p>
        <p className="muted">{t.dashboardEvidenceNote}</p>
      </div>
    </section>
  );
}
