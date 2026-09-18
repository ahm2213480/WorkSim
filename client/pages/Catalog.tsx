import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSimulations, type SimulationListItem } from '../simulations';
import { useLocale } from '../locale';

const companyClass: Record<string, string> = { NovaShop: 'nova', MarketFlow: 'market' };

/** Learner-facing catalog. Search and skill filtering are plain client-side
 *  operations on an already-loaded list of two-to-tens of items: no AI and no
 *  extra API round-trips are justified at this scale. */
export function Catalog() {
  const { t, locale } = useLocale();
  // The load key pattern: state stores which locale it belongs to, and the
  // render derives staleness from that key. This avoids resetting state
  // synchronously inside the effect (react-hooks set-state-in-effect rule)
  // while still showing a loading state when the locale flips.
  const [loaded, setLoaded] = useState<{ key: string; simulations: SimulationListItem[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [skill, setSkill] = useState('');

  const simulations = loaded?.key === locale ? loaded.simulations : null;
  const failed = failedFor === locale;

  useEffect(() => {
    let active = true;
    listSimulations(locale)
      .then((data) => { if (active) setLoaded({ key: locale, simulations: data.simulations }); })
      .catch(() => { if (active) setFailedFor(locale); });
    return () => { active = false; };
  }, [locale]);

  const skills = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const simulation of simulations ?? []) {
      for (const entry of simulation.skills) bySlug.set(entry.slug, entry.name);
    }
    return [...bySlug.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [simulations]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (simulations ?? []).filter((simulation) => {
      if (skill && !simulation.skills.some((entry) => entry.slug === skill)) return false;
      if (!needle) return true;
      const haystack = [simulation.title, simulation.company, simulation.roleTitle, ...simulation.skills.map((entry) => entry.name)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [simulations, query, skill]);

  return (
    <section className="catalog-page container page-pad" aria-labelledby="catalog-title">
      <p className="eyebrow">{t.catalog}</p>
      <h1 id="catalog-title">{t.catalogTitle}</h1>
      <p className="intro">{t.catalogSubtitle}</p>

      <div className="catalog-controls">
        <div className="field">
          <label htmlFor="catalog-search">{t.catalogSearchLabel}</label>
          <input
            id="catalog-search"
            type="search"
            placeholder={t.catalogSearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {skills.length > 0 && (
          <div className="field">
            <label htmlFor="catalog-skill">{t.catalogSkillFilter}</label>
            <select id="catalog-skill" value={skill} onChange={(event) => setSkill(event.target.value)}>
              <option value="">{t.catalogAllSkills}</option>
              {skills.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      {failed && <p className="form-error" role="alert">{t.errorNetwork}</p>}
      {!failed && simulations === null && <p className="muted">{t.loadingSection}</p>}

      {simulations !== null && (
        <>
          <p className="muted catalog-count" aria-live="polite">
            {visible.length} {t.catalogCount}
          </p>
          {visible.length === 0 ? (
            <div className="dashboard-empty">
              <h2>{t.catalogNoResultsTitle}</h2>
              <p>{t.catalogNoResultsText}</p>
            </div>
          ) : (
            <div className="scenario-grid catalog-grid">
              {visible.map((simulation) => (
                <article key={simulation.id} className="scenario">
                  <div className="scenario-top">
                    <span className={`company-logo ${companyClass[simulation.company] ?? 'nova'}`} aria-hidden="true">
                      {simulation.company.slice(0, 1)}
                    </span>
                    <b>{simulation.company}</b>
                    <span className="muted">{simulation.estimatedMinutes} {t.minutesSuffix}</span>
                  </div>
                  <p className="role">{simulation.roleTitle}</p>
                  <h3>{simulation.title}</h3>
                  <p>{simulation.summary}</p>
                  <p className="skills">
                    <span className="muted">{t.skillsLabel}: </span>
                    {simulation.skills.map((entry) => entry.name).join(' · ')}
                  </p>
                  <Link className="button button-small" to={`/simulations/${simulation.slug}`}>{t.viewDetails}</Link>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
