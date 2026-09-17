import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { describeError } from '../form-errors';
import { useLocale } from '../locale';

export function Login() {
  const { t } = useLocale();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await login(String(data.get('email') ?? ''), String(data.get('password') ?? ''));
      // Return users to the protected page they originally asked for.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/dashboard', { replace: true });
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth container page-pad" aria-labelledby="login-title">
      <h1 id="login-title">{t.loginTitle}</h1>
      <p className="auth-subtitle">{t.loginSubtitle}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">{t.email}</label>
          <input id="login-email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="login-password">{t.password}</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="button" type="submit" disabled={pending}>{pending ? t.working : t.loginAction}</button>
      </form>
      <p className="auth-switch">{t.noAccount} <Link to="/register">{t.register}</Link></p>
      <p className="demo-box">{t.demoHint}</p>
    </section>
  );
}
