export const MODE_LABELS = {
  auto: 'Auto',
  cooling: 'Cooling',
  heating: 'Heating',
  dry: 'Dry',
  fanOnly: 'Fan only',
}

export const FAN_LABELS = {
  auto: 'Auto',
  quiet: 'Quiet',
  fixed: 'Manual',
}

export function formatTemp(value) {
  return value == null ? '–' : `${value}°`
}
