import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../locale';
import { ApiError } from '../api';
import { createAdminSimulation, updateAdminSimulation, type AdminSimulationDetail } from '../admin';
import { TextField } from './Admin';

export function AdminSimulationForm({ initial, onSaved }: {
  initial?: Partial<AdminSimulationDetail>;
  onSaved: (id: string) => void;
}) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const str = (value: string | number | undefined): string => (value === undefined ? '' : String(value));
  const [form, setForm] = useState<Record<string, string>>({
    slug: str(initial?.slug),
    company: str(initial?.company),
    roleTitleEn: str(initial?.roleTitleEn),
    roleTitleAr: str(initial?.roleTitleAr),
    titleEn: str(initial?.titleEn),
    titleAr: str(initial?.titleAr),
    summaryEn: str(initial?.summaryEn),
    summaryAr: str(initial?.summaryAr),
    briefEn: str(initial?.briefEn),
    briefAr: str(initial?.briefAr),
    estimatedMinutes: str(initial?.estimatedMinutes) || '60',
    sortOrder: str(initial?.sortOrder) || '0',
  });
  const val = (key: string): string => form[key] ?? '';
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        estimatedMinutes: Number(form.estimatedMinutes),
        sortOrder: Number(form.sortOrder),
        isActive: initial?.id ? undefined : true,
      };
      const saved = initial?.id
        ? await updateAdminSimulation(String(initial.id), body)
        : await createAdminSimulation(body);
      onSaved(saved.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'UNKNOWN');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="work-form">
      <TextField id="slug" label={t.adminSlug} value={val('slug')} onChange={set('slug')} dir="ltr" />
      <TextField id="company" label={t.adminCompany} value={val('company')} onChange={set('company')} dir="ltr" />
      <TextField id="roleTitleEn" label={`${t.adminRoleTitle} (EN)`} value={val('roleTitleEn')} onChange={set('roleTitleEn')} />
      <TextField id="roleTitleAr" label={`${t.adminRoleTitle} (AR)`} value={val('roleTitleAr')} onChange={set('roleTitleAr')} />
      <TextField id="titleEn" label={`${t.adminSimTitle} (EN)`} value={val('titleEn')} onChange={set('titleEn')} />
      <TextField id="titleAr" label={`${t.adminSimTitle} (AR)`} value={val('titleAr')} onChange={set('titleAr')} />
      <TextField id="summaryEn" label={`${t.adminSummary} (EN)`} value={val('summaryEn')} onChange={set('summaryEn')} multiline />
      <TextField id="summaryAr" label={`${t.adminSummary} (AR)`} value={val('summaryAr')} onChange={set('summaryAr')} multiline />
      <TextField id="briefEn" label={`${t.adminBrief} (EN)`} value={val('briefEn')} onChange={set('briefEn')} multiline rows={6} />
      <TextField id="briefAr" label={`${t.adminBrief} (AR)`} value={val('briefAr')} onChange={set('briefAr')} multiline rows={6} />
      <TextField id="estimatedMinutes" label={t.adminMinutes} value={val('estimatedMinutes')} onChange={set('estimatedMinutes')} dir="ltr" />
      <TextField id="sortOrder" label={t.adminSortOrder} value={val('sortOrder')} onChange={set('sortOrder')} dir="ltr" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workspace-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? t.working : t.adminSave}</button>
        <button className="button button-ghost" type="button" onClick={() => navigate(-1)}>{t.adminCancel}</button>
      </div>
    </form>
  );
}

export function AdminNewSimulation() {
  const { t } = useLocale();
  const navigate = useNavigate();
  return (
    <section className="container page-pad" aria-labelledby="admin-new-title">
      <p className="eyebrow">{t.adminTitle}</p>
      <h1 id="admin-new-title">{t.adminNewSimulation}</h1>
      <p className="muted">{t.adminSeedNote}</p>
      <AdminSimulationForm onSaved={(id) => navigate(`/admin/simulations/${id}`)} />
    </section>
  );
}
