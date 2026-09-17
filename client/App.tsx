import { useEffect, useState } from 'react';
import { messages, type Locale } from './messages';

function initialLocale(): Locale {
  try { return localStorage.getItem('worksim-locale') === 'ar' ? 'ar' : 'en'; }
  catch { return 'en'; }
}

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = messages[locale];
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = locale === 'ar' ? 'WorkSim — جرّب العمل الحقيقي' : 'WorkSim — Practice real work';
    try { localStorage.setItem('worksim-locale', locale); } catch { /* Language still works when storage is blocked. */ }
  }, [locale]);

  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <header className="site-header container">
      <a className="brand" href="#main" aria-label="WorkSim"><span className="brand-mark" aria-hidden="true">W</span><b dir="ltr">WorkSim</b></a>
      <nav aria-label={t.nav}><a className="nav-link" href="#scenarios">{t.nav}</a>
        <button className="language" lang={locale === 'en' ? 'ar' : 'en'} onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}>{t.language}</button>
      </nav>
    </header>
    <main id="main">
      <section className="hero container" aria-labelledby="hero-title">
        <div><p className="eyebrow">{t.eyebrow}</p><h1 id="hero-title">{t.title}</h1><p className="intro">{t.intro}</p>
          <a className="button" href="#scenarios">{t.action}<span aria-hidden="true">↗</span></a>
          <p className="preview-note">{t.status}</p>
        </div>
        <aside className="desk" aria-label={t.preview}>
          <div className="desk-heading"><span className="status-dot" aria-hidden="true"/><span>{t.preview}</span><span aria-hidden="true">•••</span></div>
          <div className="desk-body"><p className="eyebrow">{t.company}</p>
            <div className="manager"><span className="avatar" aria-hidden="true">MH</span><strong>{t.manager}</strong></div>
            <blockquote>{t.message}</blockquote><h2>{t.materials}</h2>
            <ul className="materials">{[t.material1, t.material2, t.material3].map((item, i) => <li key={item}><span aria-hidden="true">0{i + 1}</span>{item}</li>)}</ul>
          </div>
        </aside>
      </section>
      <section className="catalog-section" id="scenarios" aria-labelledby="scenarios-title"><div className="container">
        <p className="eyebrow">WorkSim / 01</p><h2 id="scenarios-title">{t.section}</h2><p className="section-intro">{t.sectionIntro}</p>
        <div className="scenario-grid">
          <article className="scenario"><div className="scenario-top"><span className="company-logo nova" aria-hidden="true">N</span><span dir="ltr">NovaShop</span><span className="role">{t.frontend}</span></div>
            <h3>{t.frontendTitle}</h3><p>{t.frontendText}</p><p className="skills">{t.frontendSkills}</p></article>
          <article className="scenario"><div className="scenario-top"><span className="company-logo market" aria-hidden="true">M</span><span dir="ltr">MarketFlow</span><span className="role">{t.analyst}</span></div>
            <h3>{t.analystTitle}</h3><p>{t.analystText}</p><p className="skills">{t.analystSkills}</p></article>
        </div>
      </div></section>
      <section className="workflow container" aria-labelledby="workflow-title"><h2 id="workflow-title">{t.workflow}</h2>
        <ol>{[[t.step1, t.step1Text], [t.step2, t.step2Text], [t.step3, t.step3Text]].map(([title, text], i) => <li key={title}><span className="step-number" aria-hidden="true">0{i + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
        <aside className="principle"><h3>{t.principle}</h3><p>{t.principleText}</p></aside>
      </section>
    </main><footer className="container">{t.footer}</footer>
  </>;
}
