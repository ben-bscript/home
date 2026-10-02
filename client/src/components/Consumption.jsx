import { formatKwh } from '../format.js'

const sum = (values) => values.reduce((total, v) => total + (v ?? 0), 0)

// Daikin reports 2-hour slots for yesterday + today (d), days of last week +
// this week (w) and months of last year + this year (m).
function periods({ d = [], w = [], m = [] }) {
  const month = new Date().getMonth()
  return [
    sum(d.slice(12)),
    sum(d.slice(0, 12)),
    sum(w.slice(7)),
    sum(w.slice(0, 7)),
    m[12 + month] ?? 0,
    sum(m.slice(12)),
    sum(m.slice(0, 12)),
  ]
}

const ROWS = ['Vandaag', 'Gisteren', 'Deze week', 'Vorige week', 'Deze maand', 'Dit jaar', 'Vorig jaar']

export default function Consumption({ data }) {
  const columns = [
    ['Verwarmen', data.heating],
    ['Koelen', data.cooling],
  ]
    .filter(([, values]) => values)
    .map(([label, values]) => [label, periods(values)])

  return (
    <table>
      <thead>
        <tr>
          <th />
          {columns.map(([label]) => <th key={label}>{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row, i) => (
          <tr key={row}>
            <th>{row}</th>
            {columns.map(([label, values]) => <td key={label}>{formatKwh(values[i])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
