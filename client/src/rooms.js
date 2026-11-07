// Rooms shown on the overview. A device belongs to the room that lists its id
// or its provider; devices can also carry a room of their own (lights get one
// in the app), which may name a room that isn't listed here. Devices that
// match no room are shown under "Overige" (lights under "Lampen").
export const ROOMS = [
  { id: 'ouders', name: 'Ouders', devices: ['daikin:3e724752-a58c-44f8-b6b8-f17b8e42aa2b'] },
  { id: 'boris', name: 'Boris', devices: ['daikin:a9165c16-7a1d-4f3b-89a0-1778a54f4151'] },
  { id: 'waskot', name: 'Waskot', providers: ['renson'] },
]

const TYPE_NAMES = { climate: 'Airco', ventilation: 'Ventilatie', light: 'Lamp' }

const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')

function roomNamed(name) {
  return ROOMS.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? { id: `r-${slug(name)}`, name: name.trim() }
}

export function roomOfDevice(device) {
  if (device.room) return roomNamed(device.room)
  return ROOMS.find((r) => r.devices?.includes(device.id) || r.providers?.includes(device.provider)) ?? null
}

// The fixed rooms plus the extra rooms devices were placed in.
export function allRooms(devices) {
  const rooms = [...ROOMS]
  for (const device of devices) {
    const room = roomOfDevice(device)
    if (room && !rooms.some((r) => r.id === room.id)) rooms.push(room)
  }
  return rooms
}

export function devicesInRoom(room, devices) {
  return devices.filter((d) => roomOfDevice(d)?.id === room.id)
}

export function unassignedDevices(devices) {
  return devices.filter((d) => !roomOfDevice(d))
}

// A unit named after its room would just repeat the room heading.
export function displayName(device) {
  return device.name === roomOfDevice(device)?.name ? (TYPE_NAMES[device.type] ?? device.name) : device.name
}
