import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import Stepper from '../components/Stepper.jsx'
import Toggle from '../components/Toggle.jsx'
import { FAN_LABELS, formatTemp, MODE_LABELS } from '../format.js'
import { useDevices } from '../store.js'

function Segmented({ options, value, labels, disabled, onChange }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={option === value ? 'active' : ''}
          disabled={disabled}
          onClick={() => option !== value && onChange(option)}
        >
          {labels[option] ?? option}
        </button>
      ))}
    </div>
  )
}

export default function Device() {
  const { id } = useParams()
  const { devices, loaded, error, fetch, command } = useDevices()
  const pending = useDevices((s) => s.pending[id])
  const device = devices.find((d) => d.id === id)

  useEffect(() => {
    if (!loaded) fetch()
  }, [loaded, fetch])

  if (!device) {
    return (
      <>
        <Link to="/" className="back">← Devices</Link>
        {error ? <p className="error">{error}</p> : <p className="muted">{loaded ? 'Device not found.' : 'Loading…'}</p>}
      </>
    )
  }

  const { climate } = device
  const send = (name) => (value) => command(device.id, name, value)

  return (
    <>
      <Link to="/" className="back">← Devices</Link>
      <div className="page-head">
        <div>
          <h1>{device.name}</h1>
          <div className="muted">
            {device.model}
            {device.online === false && ' · Offline'}
          </div>
        </div>
        {climate && <Toggle checked={climate.power} disabled={pending} label="Power" onChange={send('power')} />}
      </div>
      {error && <p className="error">{error}</p>}

      {climate && (
        <div className="panel">
          <div className="readings">
            <div>
              <div className="big-temp">{formatTemp(climate.roomTemperature)}</div>
              <div className="muted">Room</div>
            </div>
            {climate.outdoorTemperature != null && (
              <div>
                <div className="big-temp">{formatTemp(climate.outdoorTemperature)}</div>
                <div className="muted">Outside</div>
              </div>
            )}
          </div>

          {climate.targetTemperature && (
            <section>
              <h2>Target temperature</h2>
              <Stepper {...climate.targetTemperature} format={formatTemp} disabled={pending} onCommit={send('targetTemperature')} />
            </section>
          )}

          <section>
            <h2>Mode</h2>
            <Segmented options={climate.modes} value={climate.mode} labels={MODE_LABELS} disabled={pending} onChange={send('mode')} />
          </section>

          {climate.fan && (
            <section>
              <h2>Fan</h2>
              <Segmented options={climate.fan.modes} value={climate.fan.mode} labels={FAN_LABELS} disabled={pending} onChange={send('fanMode')} />
              {climate.fan.mode === 'fixed' && climate.fan.speed && (
                <Stepper {...climate.fan.speed} disabled={pending} onCommit={send('fanSpeed')} />
              )}
            </section>
          )}
        </div>
      )}

      <details className="raw">
        <summary>Raw device data</summary>
        <pre>{JSON.stringify(device.raw, null, 2)}</pre>
      </details>
    </>
  )
}
