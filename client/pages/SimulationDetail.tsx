import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { useLocale } from '../locale';
import { getSimulation, startSimulation, type SimulationDetail as Detail } from '../simulations';

/** The "job posting" view: company context, the brief, what is on your desk,
 *  and what you will deliver. Reading is free — only Start creates an attempt
 *  and begins event delivery. */
export function SimulationDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Load-key pattern: the stored key (locale + slug) decides whether the
  // cached detail is fresh, so switching language or simulation shows a
  // loading state without synchronous state resets in the effect.
  const [loaded, setLoaded] = useState<{ key: string; simulation: Detail } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const loadKey = `${locale}:${slug ?? ''}`;
  const simulation = loaded?.key === loadKey ? loaded.simulation : null;
  const failed = failedFor === loadKey;

  useEffect(() => {
    if (!slug) return undefined;
    let active = true;
    getSimulation(slug, locale)
      .then((data) => { if (active) setLoaded({ key: loadKey, simulation: data.simulation }); })
      .catch(() => { if (active) setFailedFor(loadKey); });
    return () => { active = false; };
  }, [slug, locale, loadKey]);

  async function handleStart() {
    if (!slug || starting) return;
    if (!user) {
      navigate('/login', { state: { from: `/simulations/${slug}` } });
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const { attemptId } = await startSimulation(slug);
      navigate(`/workspace/${attemptId}`);
    } catch (error) {
      // Starting is idempotent on the server: an existing attempt returns its
      // id again, so "already started" can only surface as a real failure.
      setStartError(error instanceof ApiError ? error.message : t.errorUnknown);
      setStarting(false);
    }
  }

  if (failed) {
    return (
      <section className="container page-pad">
        <p className="form-error" role="alert">{t.errorNetwork}</p>
        <Link className="nav-link" to="/simulations">{t.backToCatalog}</Link>
      </section>
    );
  }
  if (!simulation) return <section className="container page-pad"><p className="muted">{t.loadingSection}</p></section>;

  return (
    <section className="detail-page container page-pad" aria-labelledby="detail-title">
      <Link className="nav-link" to="/simulations">← {t.backToCatalog}</Link>
      <p className="eyebrow">{simulation.company} · {simulation.roleTitle}</p>
      <h1 id="detail-title">{simulation.title}</h1>
      <p className="muted">{simulation.estimatedMinutes} {t.minutesSuffix} · {simulation.materialCount} {t.detailMaterialsTitle}</p>

      <div className="detail-grid">
        <div className="detail-main">
          <h2>{t.detailBriefTitle}</h2>
          <p className="brief">{simulation.brief}</p>

          <h2>{t.detailTasksTitle}</h2>
          <ul className="materials">
            {simulation.tasks.map((task) => (
              <li key={task.id}><span aria-hidden="true">▶</span> {task.title}</li>
            ))}
          </ul>

          <h2>{t.detailSkillsTitle}</h2>
          <p className="skills">{simulation.skills.map((entry) => entry.name).join(' · ')}</p>

          {startError && <p className="form-error" role="alert">{startError}</p>}
          <button className="button" onClick={() => { void handleStart(); }} disabled={starting}>
            {starting ? t.workspaceSubmitting : user ? t.detailStart : t.detailSignIn}
          </button>
          <p className="preview-note">{t.detailBriefNote}</p>
        </div>

        <aside className="detail-side" aria-labelledby="desk-title">
          <h2 id="desk-title">{t.detailMaterialsTitle}</h2>
          <ul className="materials">
            {simulation.materials.map((material) => (
              <li key={material.id}><span aria-hidden="true">{material.kind === 'DATASET' ? '▦' : '▸'}</span> {material.title}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
