import { useState } from 'react';
import { useLocale } from '../locale';
import { ApiError } from '../api';
import { createAdminTask, getAdminTask, updateAdminTask, type AdminSimulationDetail, type AdminTask } from '../admin';

/** Task + material editors for the admin detail page. Task JSON is edited as
 *  raw text (fields + rubric) with a local JSON pre-check; the server
 *  re-validates with the real evaluation parsers and is the authority, so a
 *  bad save fails as a 400 with a visible code, never as a learner 500. */

export function TaskSection({ detail }: { detail: AdminSimulationDetail }) {
  const { t } = useLocale();
  const [taskJson, setTaskJson] = useState<{ task: AdminTask } | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="admin-tasks">
      <h2 id="admin-tasks">{t.adminTasksTitle}</h2>
      <p className="muted">{t.adminTasksNote}</p>
      {saved && <p className="form-note" role="status">{t.adminSaved}</p>}
      {detail.tasks.length === 0 ? (
        <p className="muted">{t.adminTasksEmpty}</p>
      ) : (
        <ul className="attempt-list">
          {detail.tasks.map((task) => (
            <li key={task.id} className="attempt-row">
              <div>
                <b>#{task.order} {task.titleEn}</b>
                <p className="muted">{task.titleAr} · {t.adminFields}: {task.fieldCount} · {t.adminCriteria}: {task.criterionCount}</p>
              </div>
              <button
                className="button button-small" type="button"
                onClick={() => { void getAdminTask(task.id).then((d) => setTaskJson(d)); }}
              >
                {t.adminEditTask}
              </button>
            </li>
          ))}
        </ul>
      )}
      {taskJson && (
        <TaskEditor
          simulationId={detail.id}
          task={taskJson.task}
          onClose={() => setTaskJson(null)}
          onSaved={() => { setTaskJson(null); setSaved(true); window.location.reload(); }}
        />
      )}
    </section>
  );
}

function TaskEditor({ simulationId, task, onClose, onSaved }: {
  simulationId: string;
  task: AdminTask | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState({
    order: String(task?.order ?? 0),
    titleEn: task?.titleEn ?? '',
    titleAr: task?.titleAr ?? '',
    instructionsEn: task?.instructionsEn ?? '',
    instructionsAr: task?.instructionsAr ?? '',
    fieldsJson: task?.fieldsJson ?? '[]',
    checklistJson: task?.checklistJson ?? '{"version":"v1","criteria":[]}',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      JSON.parse(form.fieldsJson);
      JSON.parse(form.checklistJson);
    } catch {
      setError(t.adminJsonInvalid);
      setSaving(false);
      return;
    }
    try {
      const body = { ...form, order: Number(form.order) };
      if (task) await updateAdminTask(task.id, body);
      else await createAdminTask(simulationId, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'UNKNOWN');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="work-form admin-editor">
      <h3>{task ? t.adminEditTask : t.adminNewTask}</h3>
      <div className="field">
        <label htmlFor="task-order">{t.adminOrder}</label>
        <input id="task-order" type="text" dir="ltr" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-title-en">{t.adminTaskTitle} (EN)</label>
        <input id="task-title-en" type="text" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-title-ar">{t.adminTaskTitle} (AR)</label>
        <input id="task-title-ar" type="text" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-instr-en">{t.adminInstructions} (EN)</label>
        <textarea id="task-instr-en" rows={4} value={form.instructionsEn} onChange={(e) => setForm({ ...form, instructionsEn: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-instr-ar">{t.adminInstructions} (AR)</label>
        <textarea id="task-instr-ar" rows={4} value={form.instructionsAr} onChange={(e) => setForm({ ...form, instructionsAr: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-fields">{t.adminFieldsJson}</label>
        <textarea id="task-fields" rows={6} dir="ltr" className="code-input" value={form.fieldsJson} onChange={(e) => setForm({ ...form, fieldsJson: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="task-rubric">{t.adminRubricJson}</label>
        <textarea id="task-rubric" rows={8} dir="ltr" className="code-input" value={form.checklistJson} onChange={(e) => setForm({ ...form, checklistJson: e.target.value })} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="workspace-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? t.working : t.adminSave}</button>
        <button className="button button-ghost" type="button" onClick={onClose}>{t.adminCancel}</button>
      </div>
    </form>
  );
}
