import { useEffect, useState } from 'react'
import { useProviders } from '../store.js'

const PAIR_SECONDS = 254
const EVENT_LABELS = {
  joined: 'Verbonden…',
  started: 'Wordt herkend…',
  successful: 'Toegevoegd',
  failed: 'Mislukt, probeer opnieuw',
  left: 'Verwijderd',
}

function useSecondsLeft(until) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!until) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])

  return until ? Math.max(0, Math.round((until - now) / 1000)) : 0
}

export default function ZigbeeSettings({ provider }) {
  const pair = useProviders((s) => s.pair)
  const fetch = useProviders((s) => s.fetch)
  const z = provider.zigbee
  const left = useSecondsLeft(z.permitJoin ? z.permitJoinUntil : null)
  const pairing = z.permitJoin && (left > 0 || !z.permitJoinUntil)

  // Follow joining devices while the network is open.
  useEffect(() => {
    if (!pairing) return
    const timer = setInterval(fetch, 3000)
    return () => clearInterval(timer)
  }, [pairing, fetch])

  let text
  if (!z.mqttConnected) text = `${z.mqttError ?? `Geen verbinding met de MQTT-broker op ${z.mqttUrl}.`} Start Zigbee2MQTT en Mosquitto met zigbee/install.sh op de server.`
  else if (!z.bridgeOnline) text = 'Verbonden met MQTT, maar Zigbee2MQTT is offline. Zit de Sonoff-dongle in de server?'
  else text = `${z.lights} ${z.lights === 1 ? 'lamp' : 'lampen'} van ${z.devices} Zigbee-toestellen${z.coordinator ? ` · dongle ${z.coordinator}` : ''}${z.version ? ` · Zigbee2MQTT ${z.version}` : ''}.`

  return (
    <>
      <p className="muted">{text}</p>
      {provider.connected && (
        pairing ? (
          <>
            <p className="muted">
              Zoeken naar nieuwe lampen… nog {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Zet de lamp nu in koppelmodus: meestal door
              hem 5–6 keer aan en uit te schakelen, of hem nieuw in te draaien.
            </p>
            <button type="button" onClick={() => pair(provider.id, 0)}>Stoppen met zoeken</button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => pair(provider.id, PAIR_SECONDS)}>Nieuwe lampen zoeken</button>
        )
      )}
      {z.events.length > 0 && (
        <ul className="pairing">
          {z.events.map((e) => (
            <li key={e.ieee}>
              <span>{e.name}</span>
              <span className="muted">{e.status === 'successful' && e.supported === false ? 'Niet ondersteund' : (EVENT_LABELS[e.status] ?? e.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
