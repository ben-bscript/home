import { Link } from 'react-router'
import { useDevices } from '../store.js'
import { formatTemp, MODE_LABELS } from '../format.js'
import Toggle from './Toggle.jsx'

export default function DeviceCard({ device }) {
  const command = useDevices((s) => s.command)
  const pending = useDevices((s) => s.pending[device.id])
  const { climate } = device

  return (
    <article className={`card${climate?.power ? ' on' : ''}`}>
      <div className="card-head">
        <Link to={`/devices/${encodeURIComponent(device.id)}`} className="card-title">
          {device.name}
        </Link>
        {climate && (
          <Toggle
            checked={climate.power}
            disabled={pending}
            label={`Power ${device.name}`}
            onChange={(on) => command(device.id, 'power', on)}
          />
        )}
      </div>
      {climate ? (
        <>
          <div className="big-temp">{formatTemp(climate.roomTemperature)}</div>
          <div className="muted">
            {climate.power
              ? `${MODE_LABELS[climate.mode] ?? climate.mode}${climate.targetTemperature ? ` to ${formatTemp(climate.targetTemperature.value)}` : ''}`
              : 'Off'}
            {climate.outdoorTemperature != null && ` · Outside ${formatTemp(climate.outdoorTemperature)}`}
          </div>
        </>
      ) : (
        <div className="muted">{device.model ?? 'Unsupported device'}</div>
      )}
      {device.online === false && <div className="badge warn">Offline</div>}
    </article>
  )
}
