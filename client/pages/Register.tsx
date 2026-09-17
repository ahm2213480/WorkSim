import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { describeError } from '../form-errors';
import { useLocale } from '../locale';

export function Register() {
  const { t, locale } = useLocale();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await register({
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        locale: String(data.get('locale')) === 'AR' ? 'AR' : 'EN',
      });
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth container page-pad" aria-labelledby="register-title">
      <h1 id="register-title">{t.registerTitle}</h1>
      <p className="auth-subtitle">{t.registerSubtitle}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="register-name">{t.name}</label>
          <input id="register-name" name="name" type="text" autoComplete="name" required minLength={2} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="register-email">{t.email}</label>
          <input id="register-email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>
        <div className="field">
          <label htmlFor="register-password">{t.password}</label>
          <input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <p className="field-hint">{t.passwordHint}</p>
        </div>
        <div className="field">
          <label htmlFor="register-locale">{t.languageLabel}</label>
          <select id="register-locale" name="locale" defaultValue={locale === 'ar' ? 'AR' : 'EN'}>
            <option value="EN">{t.langEnglish}</option>
            <option value="AR">{t.langArabic}</option>
          </select>
        </div>
        <button className="button" type="submit" disabled={pending}>{pending ? t.working : t.registerAction}</button>
      </form>
      <p className="auth-switch">{t.haveAccount} <Link to="/login">{t.login}</Link></p>
    </section>
  );
}
