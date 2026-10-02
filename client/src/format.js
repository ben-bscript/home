export const MODE_LABELS = {
  auto: 'Auto',
  cooling: 'Koelen',
  heating: 'Verwarmen',
  dry: 'Drogen',
  fanOnly: 'Ventileren',
  off: 'Uit',
}

export const FAN_LABELS = {
  auto: 'Auto',
  quiet: 'Stil',
  fixed: 'Handmatig',
}

export const SWING_LABELS = {
  stop: 'Vast',
  swing: 'Swing',
  windNice: 'Comfort',
}

export const TOGGLE_LABELS = {
  powerfulMode: 'Krachtig',
  econoMode: 'Econo',
  streamerMode: 'Streamer',
  outdoorSilentMode: 'Stil buiten',
}

export const TOGGLE_GLYPHS = {
  powerfulMode: 'PWR',
  econoMode: 'ECO',
  streamerMode: 'STR',
  outdoorSilentMode: 'Zz',
}

export const DAY_LABELS = {
  monday: 'Maandag',
  tuesday: 'Dinsdag',
  wednesday: 'Woensdag',
  thursday: 'Donderdag',
  friday: 'Vrijdag',
  saturday: 'Zaterdag',
  sunday: 'Zondag',
  weekdays: 'Weekdagen',
  weekend: 'Weekend',
}

export function formatTemp(value) {
  return value == null ? '–' : String(value).replace('.', ',')
}

export function formatKwh(value) {
  return `${String(Math.round(value * 10) / 10).replace('.', ',')} kWh`
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

export function fanLabel(fan) {
  if (!fan) return '–'
  return fan.mode === 'fixed' && fan.speed ? `Stand ${fan.speed.value}` : (FAN_LABELS[fan.mode] ?? fan.mode)
}
