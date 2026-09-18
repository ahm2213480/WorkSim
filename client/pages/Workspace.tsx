import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api';
import { useLocale } from '../locale';
import { getAttempt, getSimulation, saveDraft, submitAttempt, type AttemptEvent, type AttemptPayload, type SimulationDetail } from '../simulations';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const POLL_INTERVAL_MS = 20_000;
const AUTOSAVE_DELAY_MS = 1_000;

/** The simulation workspace — the core product screen and the mobile-first
 *  area. It behaves like a desk: the task and your draft in the main column,
 *  your inbox (live events) and the company materials beside it.
 *
 *  Drafts are debounced server saves, so a closed tab loses at most a second
 *  of typing. While the attempt is active the inbox polls the attempt endpoint:
 *  that request also triggers clock-based event delivery on the server, so no
 *  background worker is needed. Polling merges only server-owned state (events,
 *  status), never the draft the learner is typing. Reference materials come
 *  from the public catalog entry; the frozen brief itself is served from the
 *  attempt's snapshot, so later catalog edits cannot rewrite what was asked. */
export function Workspace() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, locale } = useLocale();
  const navigate = useNavigate();

  // Load-key pattern (see Catalog): `loaded` remembers which locale+attempt it
  // belongs to and the render derives freshness, so nothing is reset
  // synchronously inside effects when the route or language changes.
  const [loaded, setLoaded] = useState<{ key: string; attempt: AttemptPayload; materials: SimulationDetail['materials'] } | null>(null);
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [missing, setMissing] = useState<string[]>([]);
  const [failedState, setFailedState] = useState<'network' | 'notfound' | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draftRef = useRef(draft);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadKey = `${locale}:${attemptId ?? ''}`;
  const attempt = loaded?.key === loadKey ? loaded.attempt : null;
  const materials = loaded?.key === loadKey ? loaded.materials : [];
  const failed = failedKey === loadKey ? failedState : null;

  useEffect(() => {
    draftRef.current = draft; // Keep the debounced saver away from render-time ref writes.
  }, [draft]);

  // Initial load: the attempt (frozen brief + saved draft + delivered events)
  // and the public catalog entry for reference materials, in parallel.
  useEffect(() => {
    if (!attemptId) return undefined;
    let active = true;
    getAttempt(attemptId, locale)
      .then((data) => {
        if (!active) return;
        setLoaded({ key: loadKey, attempt: data.attempt, materials: [] });
        setEvents(data.attempt.events);
        setDraft(data.attempt.draft);
        return getSimulation(data.attempt.simulation.slug, locale).then((catalog) => {
          if (active) {
            setLoaded((current) => (current?.key === loadKey ? { ...current, materials: catalog.simulation.materials } : current));
          }
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setFailedState(error instanceof ApiError && error.status === 404 ? 'notfound' : 'network');
          setFailedKey(loadKey);
        }
      });
    return () => { active = false; };
  }, [attemptId, locale, loadKey]);

  // Inbox polling. Only server-owned fields are merged; `draftRef` stays the
  // single source of truth for what the learner is typing.
  useEffect(() => {
    if (!attemptId || attempt?.status !== 'ACTIVE') return undefined;
    const timer = setInterval(() => {
      getAttempt(attemptId, locale)
        .then((data) => {
          setEvents(data.attempt.events);
          setLoaded((current) => (current?.key === loadKey
            ? { ...current, attempt: { ...current.attempt, status: data.attempt.status, submissionId: data.attempt.submissionId, lastSavedAt: data.attempt.lastSavedAt } }
            : current));
        })
        .catch(() => { /* Transient network problems surface on the next tick. */ });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [attemptId, attempt?.status, locale, loadKey]);

  const persist = useCallback(() => {
    if (!attemptId) return;
    setSaveState('saving');
    saveDraft(attemptId, draftRef.current)
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  }, [attemptId]);

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMissing((current) => current.filter((field) => field !== key));
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, AUTOSAVE_DELAY_MS);
  }

  async function handleSubmit() {
    if (!attempt || submitting) return;
    const required = attempt.task.fields.filter((field) => field.required && !(draft[field.key] ?? '').trim());
    if (required.length > 0) {
      setMissing(required.map((field) => field.key));
      setSubmitError(t.errorRequiredFields);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const { submissionId } = await submitAttempt(attempt.id, draft, locale);
      navigate(`/evidence/${submissionId}`);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : t.errorUnknown);
      setSubmitting(false);
    }
  }

  if (failed) {
    return (
      <section className="container page-pad">
        <p className="form-error" role="alert">{failed === 'notfound' ? t.errorAttemptNotFound : t.errorNetwork}</p>
        <Link className="nav-link" to="/dashboard">{t.evidenceBack}</Link>
      </section>
    );
  }
  if (!attempt) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  const submitted = attempt.status !== 'ACTIVE';
  const saveLabel = saveState === 'saving' ? t.workspaceSaving
    : saveState === 'saved' ? t.workspaceSaved
    : saveState === 'dirty' ? t.workspaceUnsaved
    : t.workspaceAutosave;

  return (
    <section className="workspace container page-pad" aria-labelledby="workspace-title">
      <div className="workspace-head">
        <div>
          <p className="eyebrow">{attempt.simulation.company} · {attempt.simulation.roleTitle}</p>
          <h1 id="workspace-title">{attempt.simulation.title}</h1>
        </div>
        <Link className="nav-link" to="/dashboard">{t.workspaceLeave}</Link>
      </div>

      {submitted && (
        <p className="form-error" role="status">
          {t.evidenceSubmittedOn}: {new Date(attempt.submittedAt ?? '').toLocaleString(locale === 'ar' ? 'ar' : 'en')}
          {attempt.submissionId && (
            <> — <Link className="inline-link" to={`/evidence/${attempt.submissionId}`}>{t.dashboardReview}</Link></>
          )}
        </p>
      )}

      <div className="workspace-grid">
        <div className="workspace-task">
          <h2>{t.workspaceTaskTitle}: {attempt.task.title}</h2>
          <p className="muted">{t.workspaceInstructionsTitle}</p>
          <p className="task-instructions">{attempt.task.instructions}</p>

          <h2>{t.workspaceYourWorkTitle}</h2>
          <p className="muted save-state" aria-live="polite">{saveLabel}</p>
          {attempt.task.fields.map((field) => (
            <div className="field" key={field.key}>
              <label htmlFor={`field-${field.key}`}>
                {field.label}
                {field.required && <span className="muted"> *</span>}
              </label>
              {field.kind === 'code' || field.multiline ? (
                <textarea
                  id={`field-${field.key}`}
                  className={field.kind === 'code' ? 'code-input' : undefined}
                  dir="ltr"
                  rows={field.kind === 'code' ? 10 : 5}
                  value={draft[field.key] ?? ''}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  aria-invalid={missing.includes(field.key) || undefined}
                />
              ) : (
                <input
                  id={`field-${field.key}`}
                  type="text"
                  value={draft[field.key] ?? ''}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  aria-invalid={missing.includes(field.key) || undefined}
                />
              )}
              {missing.includes(field.key) && <p className="field-hint" role="alert">{t.errorRequiredFields}</p>}
            </div>
          ))}

          {submitError && <p className="form-error" role="alert">{submitError}</p>}
          <div className="workspace-actions">
            <button className="button" onClick={() => { void handleSubmit(); }} disabled={submitting || submitted}>
              {submitting ? t.workspaceSubmitting : t.workspaceSubmit}
            </button>
            <button className="button button-small" onClick={persist} disabled={saveState === 'saving' || submitted}>
              {t.workspaceSaveDraft}
            </button>
          </div>
          <p className="preview-note">{t.workspaceSubmitConfirm}</p>
        </div>

        <aside className="workspace-side">
          <h2>{t.workspaceInboxTitle}</h2>
          {events.length === 0 && <p className="muted">{t.workspaceInboxEmpty}</p>}
          <ul className="inbox">
            {events.map((event) => (
              <li key={event.id} className="inbox-item">
                <p className="inbox-meta">
                  <b>{event.fromName}</b>{event.fromRole ? ` · ${event.fromRole}` : ''}
                  {' · '}
                  <time dateTime={event.deliveredAt}>{new Date(event.deliveredAt).toLocaleTimeString(locale === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}</time>
                </p>
                <p className="inbox-title">{event.title}</p>
                <p className="inbox-body">{event.body}</p>
              </li>
            ))}
          </ul>

          <h2>{t.workspaceMaterialsTitle}</h2>
          <ul className="materials workspace-materials">
            {materials.map((material) => (
              <li key={material.id}><span aria-hidden="true">{material.kind === 'DATASET' ? '▦' : '▸'}</span> {material.title}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
