import { useState } from 'react';
import { useLocale } from '../locale';
import { ApiError } from '../api';
import { createAdminMaterial, deleteAdminMaterial, getAdminMaterial, updateAdminMaterial, type AdminMaterial, type AdminSimulationDetail } from '../admin';

export function MaterialSection({ detail }: { detail: AdminSimulationDetail }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState<Partial<AdminMaterial> | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="admin-materials">
      <h2 id="admin-materials">{t.adminMaterialsTitle}</h2>
      <p className="muted">{t.adminMaterialsNote}</p>
      {saved && <p className="form-note" role="status">{t.adminSaved}</p>}
      <p>
        <button className="button button-small" type="button" onClick={() => setEditing('new')}>{t.adminNewMaterial}</button>
      </p>
      {detail.materials.length === 0 ? (
        <p className="muted">{t.adminMaterialsEmpty}</p>
      ) : (
        <ul className="attempt-list">
          {detail.materials.map((material) => (
            <li key={material.id} className="attempt-row">
              <div>
                <b>#{material.order} [{material.kind}] {material.titleEn}</b>
                <p className="muted">{material.titleAr}</p>
              </div>
              <span>
                <button
                  className="button button-small" type="button"
                  onClick={() => { void getAdminMaterial(material.id).then((d) => setEditing(d.material)); }}
                >
                  {t.adminEditMaterial}
                </button>
                {' '}
                <button
                  className="button button-small button-ghost" type="button"
                  onClick={() => {
                    if (window.confirm(t.adminDeleteConfirm)) {
                      void deleteAdminMaterial(material.id).then(() => { setSaved(true); window.location.reload(); });
                    }
                  }}
                >
                  {t.adminDelete}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <MaterialEditor
          simulationId={detail.id}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setSaved(true); window.location.reload(); }}
        />
      )}
    </section>
  );
}

function MaterialEditor({ simulationId, initial, onClose, onSaved }: {
  simulationId: string;
  initial: Partial<AdminMaterial> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState({
    order: String(initial?.order ?? 0),
    kind: initial?.kind ?? 'BRIEF',
    titleEn: initial?.titleEn ?? '',
    titleAr: initial?.titleAr ?? '',
    contentEn: initial?.contentEn ?? '',
    contentAr: initial?.contentAr ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, order: Number(form.order) };
      if (initial?.id) await updateAdminMaterial(initial.id, body);
      else await createAdminMaterial(simulationId, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'UNKNOWN');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="work-form admin-editor">
      <h3>{initial?.id ? t.adminEditMaterial : t.adminNewMaterial}</h3>
      <div className="field">
        <label htmlFor="mat-order">{t.adminOrder}</label>
        <input id="mat-order" type="text" dir="ltr" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="mat-kind">{t.adminKind}</label>
        <input id="mat-kind" type="text" dir="ltr" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="mat-title-en">{t.adminMaterialTitle} (EN)</label>
        <input id="mat-title-en" type="text" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="mat-title-ar">{t.adminMaterialTitle} (AR)</label>
        <input id="mat-title-ar" type="text" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="mat-content-en">{t.adminContent} (EN)</label>
        <textarea id="mat-content-en" rows={6} dir="ltr" className="code-input" value={form.contentEn} onChange={(e) => setForm({ ...form, contentEn: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="mat-content-ar">{t.adminContent} (AR)</label>
        <textarea id="mat-content-ar" rows={6} dir="ltr" className="code-input" value={form.contentAr} onChange={(e) => setForm({ ...form, contentAr: e.target.value })} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workspace-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? t.working : t.adminSave}</button>
        <button className="button button-ghost" type="button" onClick={onClose}>{t.adminCancel}</button>
      </div>
    </form>
  );
}
