import { Link } from 'react-router-dom';
import { useLocale } from '../locale';

export function NotFound() {
  const { t } = useLocale();
  return (
    <section className="container page-pad" aria-labelledby="notfound-title">
      <h1 id="notfound-title">404</h1>
      <p className="muted">{t.notFoundText}</p>
      <p><Link className="button" to="/">{t.notFoundAction}</Link></p>
    </section>
  );
}
