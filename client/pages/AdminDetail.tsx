import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLocale } from '../locale';
import { getAdminSimulation, setAdminSimulationActive, type AdminSimulationDetail } from '../admin';
import { useLoad } from './Admin';
import { AdminSimulationForm } from './AdminForm';
import { TaskSection } from './AdminSections';
import { MaterialSection } from './AdminMaterials';

export function AdminSimulationDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const key = `detail:${id ?? ''}:${locale}`;
  const { value: detail, failed } = useLoad<AdminSimulationDetail>(key, () => getAdminSimulation(id ?? '').then((d) => d.simulation));
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleToggle() {
    if (!detail) return;
    setToggling(true);
    try {
      await setAdminSimulationActive(detail.id, !detail.isActive);
      window.location.reload();
    } finally {
      setToggling(false);
    }
  }

  if (failed) return <section className="container page-pad"><p className="form-error" role="alert">{t.errorNetwork}</p></section>;
  if (!detail) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  return (
    <section className="container page-pad" aria-labelledby="admin-detail-title">
      <p className="eyebrow">{t.adminTitle} · {detail.slug}</p>
      <h1 id="admin-detail-title">{detail.titleEn}</h1>
      <p className="muted">
        {detail.company} · {detail.isActive ? t.adminActive : t.adminInactive} ·{' '}
        {t.adminAttemptCount}: {detail.attemptCount}
      </p>
      <p className="muted">{t.adminSeedNote}</p>
      <div className="workspace-actions">
        <button className="button button-small" type="button" onClick={() => setEditing((e) => !e)}>
          {editing ? t.adminCancel : t.adminEdit}
        </button>
        <button className="button button-small button-ghost" type="button" disabled={toggling} onClick={handleToggle}>
          {detail.isActive ? t.adminDeactivate : t.adminActivate}
        </button>
      </div>

      {editing && (
        <AdminSimulationForm
          initial={{ ...detail, id: detail.id }}
          onSaved={() => { setEditing(false); window.location.reload(); }}
        />
      )}

      <TaskSection detail={detail} />
      <MaterialSection detail={detail} />
    </section>
  );
}
