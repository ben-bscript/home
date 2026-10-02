import { Link, useSearchParams } from 'react-router'
import { BackIcon } from '../components/icons.jsx'
import { useProviders } from '../store.js'

export default function Settings() {
  const { providers, error, logout } = useProviders()
  const [params] = useSearchParams()

  return (
    <div className="screen">
      <header className="bar">
        <Link to="/" aria-label="Terug"><BackIcon /></Link>
        <h1>Instellingen</h1>
        <span className="bar-room" />
      </header>
      {params.get('error') && <p className="error">{params.get('error')}</p>}
      {error && <p className="error">{error}</p>}

      <div className="stack">
        {providers.map((p) => (
          <div className="card" key={p.id}>
            <div className="card-head">
              <h2>{p.name}</h2>
              <span className={`badge${p.connected ? ' ok' : ''}`}>{p.connected ? 'Gekoppeld' : 'Niet gekoppeld'}</span>
            </div>

            {!p.configured && (
              <p className="muted">
                Zet de client-ID en het secret van je developer-app in <code>server/.env</code> en herstart de server. Registreer{' '}
                <code>{p.redirectUri}</code> als redirect-URI van de app.
              </p>
            )}
            {p.rateLimit?.remainingDay != null && (
              <p className="muted">
                Nog {p.rateLimit.remainingDay} van {p.rateLimit.limitDay} API-aanvragen vandaag.
              </p>
            )}

            {p.connected ? (
              <button type="button" onClick={() => logout(p.id)}>Ontkoppelen</button>
            ) : (
              p.configured && <a className="button primary" href={`/api/auth/${p.id}/login`}>Koppelen</a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
