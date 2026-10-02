import { useSearchParams } from 'react-router'
import { useProviders } from '../store.js'

export default function Settings() {
  const { providers, error, logout } = useProviders()
  const [params] = useSearchParams()

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      {params.get('error') && <p className="error">{params.get('error')}</p>}
      {error && <p className="error">{error}</p>}

      {providers.map((p) => (
        <div className="panel" key={p.id}>
          <div className="card-head">
            <h2>{p.name}</h2>
            <span className={`badge ${p.connected ? 'ok' : ''}`}>{p.connected ? 'Connected' : 'Not connected'}</span>
          </div>

          {!p.configured && (
            <p className="muted">
              Add the client ID and secret of your developer app to <code>server/.env</code> and restart the server. Register{' '}
              <code>{p.redirectUri}</code> as the app's redirect URI.
            </p>
          )}
          {p.rateLimit?.remainingDay != null && (
            <p className="muted">
              {p.rateLimit.remainingDay} of {p.rateLimit.limitDay} API requests left today.
            </p>
          )}

          {p.connected ? (
            <button onClick={() => logout(p.id)}>Disconnect</button>
          ) : (
            p.configured && <a className="button primary" href={`/api/auth/${p.id}/login`}>Connect</a>
          )}
        </div>
      ))}
    </>
  )
}
