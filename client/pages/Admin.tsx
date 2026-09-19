import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../locale';
import { listAdminSimulations, type AdminSimulationItem } from '../admin';

/** Admin catalog management. List → detail → inline editors for the simulation
 *  fields, task JSON (fields + rubric, validated server-side with the same
 *  parsers evaluation uses) and materials (full CRUD — materials are
 *  unreferenced, unlike simulations/tasks which are never deleted because
 *  learner evidence points at them). Activate/deactivate flips catalog
 *  visibility without touching data. */

/** Load-key fetch helper shared by the admin screens (same pattern as
 *  Catalog/Dashboard: the stored key decides freshness, so a language switch
 *  shows a loading state without resetting state inside the effect). The
 *  effect fetches once per key; React strict-mode double-invocation is
 *  already safe because the fetch is idempotent and the cleanup cancels. */
export function useLoad<T>(key: string, load: () => Promise<T>) {
  const [loaded, setLoaded] = useState<{ key: string; value: T } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    let active = true;
    loadRef.current = load;
    loadRef.current()
      .then((value) => { if (active) setLoaded({ key, value }); })
      .catch(() => { if (active) setFailedFor(key); });
    return () => { active = false; };
  }, [key, load]);
  return { value: loaded?.key === key ? loaded.value : null, failed: failedFor === key };
}

export function AdminCatalog() {
  const { t, locale } = useLocale();
  const { value: simulations, failed } = useLoad(`list:${locale}`, () => listAdminSimulations(locale).then((d) => d.simulations));
  return (
    <section className="dashboard container page-pad" aria-labelledby="admin-title">
      <p className="eyebrow">{t.adminTitle}</p>
      <h1 id="admin-title">{t.adminCatalogTitle}</h1>
      <p className="muted">{t.adminCatalogIntro}</p>
      <p><Link className="button button-small" to="/admin/simulations/new">{t.adminNewSimulation}</Link></p>
      {failed && <p className="form-error" role="alert">{t.errorNetwork}</p>}
      {simulations !== null && (
        simulations.length === 0 ? (
          <p className="muted">{t.adminCatalogEmpty}</p>
        ) : (
          <ul className="attempt-list">
            {simulations.map((item: AdminSimulationItem) => (
              <li key={item.id} className="attempt-row">
                <div>
                  <b>{item.title}</b>
                  <p className="muted">
                    {item.company} · {item.slug} ·{' '}
                    {item.isActive ? t.adminActive : t.adminInactive} ·{' '}
                    {t.adminTaskCount}: {item.taskCount} · {t.adminMaterialCount}: {item.materialCount} ·{' '}
                    {t.adminAttemptCount}: {item.attemptCount}
                  </p>
                </div>
                <Link className="button button-small" to={`/admin/simulations/${item.slug}`}>{t.adminOpen}</Link>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

export function TextField({ id, label, value, onChange, multiline, rows, dir }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; rows?: number; dir?: 'ltr';
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline
        ? <textarea id={id} value={value} rows={rows ?? 4} dir={dir} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} type="text" value={value} dir={dir} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
