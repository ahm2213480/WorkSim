import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { LocaleProvider, useLocale } from './locale';
import { Catalog } from './pages/Catalog';
import { Dashboard } from './pages/Dashboard';
import { EmployerEvidenceList, EmployerEvidencePage } from './pages/Employer';
import { EvidencePage } from './pages/Evidence';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { MentorQueue, MentorReviewPage } from './pages/Mentor';
import { NotFound } from './pages/NotFound';
import { Register } from './pages/Register';
import { SimulationDetail } from './pages/SimulationDetail';
import { Workspace } from './pages/Workspace';

/** Gate for signed-in pages. While the session is being checked it shows a
 *  loading state (no login-form flash), and the requested path is forwarded so
 *  login can return the user to where they were heading. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { t } = useLocale();
  const location = useLocation();
  if (status === 'loading') {
    return <div className="container page-pad"><p className="muted">{t.loading}</p></div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function AppHeader() {
  const { t, locale, toggleLocale } = useLocale();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="site-header container">
      <Link className="brand" to="/" aria-label="WorkSim"><span className="brand-mark" aria-hidden="true">W</span><b dir="ltr">WorkSim</b></Link>
      <nav aria-label={t.nav}>
        {user ? (
          <>
            <Link className="nav-link" to="/dashboard">{t.dashboard}</Link>
            {user.role === 'MENTOR' && <Link className="nav-link" to="/mentor">{t.mentorNav}</Link>}
            {user.role === 'EMPLOYER' && <Link className="nav-link" to="/employer">{t.employerNav}</Link>}
            <Link className="nav-link" to="/simulations">{t.catalog}</Link>
            <button className="language" onClick={() => { void logout().finally(() => navigate('/')); }}>{t.logout}</button>
          </>
        ) : (
          <>
            <Link className="nav-link" to="/login">{t.login}</Link>
            <Link className="button button-small" to="/register">{t.register}</Link>
          </>
        )}
        <button className="language" lang={locale === 'en' ? 'ar' : 'en'} onClick={toggleLocale}>{t.language}</button>
      </nav>
    </header>
  );
}

function Shell() {
  const { t } = useLocale();
  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <AppHeader />
    <main id="main">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/simulations" element={<Catalog />} />
        <Route path="/simulations/:slug" element={<SimulationDetail />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/mentor" element={<RequireAuth><MentorQueue /></RequireAuth>} />
        <Route path="/mentor/:submissionId" element={<RequireAuth><MentorReviewPage /></RequireAuth>} />
        <Route path="/employer" element={<RequireAuth><EmployerEvidenceList /></RequireAuth>} />
        <Route path="/employer/evidence/:submissionId" element={<RequireAuth><EmployerEvidencePage /></RequireAuth>} />
        <Route path="/workspace/:attemptId" element={<RequireAuth><Workspace /></RequireAuth>} />
        <Route path="/evidence/:submissionId" element={<RequireAuth><EvidencePage /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
    <footer className="container">{t.footer}</footer>
  </>;
}

export function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </LocaleProvider>
  );
}
