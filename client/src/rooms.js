// Rooms shown on the overview. A device belongs to the room that lists its id
// or its provider; devices that match no room are shown under "Overige".
export const ROOMS = [
  { id: 'ouders', name: 'Ouders', devices: ['daikin:3e724752-a58c-44f8-b6b8-f17b8e42aa2b'] },
  { id: 'boris', name: 'Boris', devices: ['daikin:a9165c16-7a1d-4f3b-89a0-1778a54f4151'] },
  { id: 'waskot', name: 'Waskot', providers: ['renson'] },
]

const TYPE_NAMES = { climate: 'Airco', ventilation: 'Ventilatie' }

export function roomOfDevice(device) {
  return ROOMS.find((r) => r.devices?.includes(device.id) || r.providers?.includes(device.provider)) ?? null
}

export function devicesInRoom(room, devices) {
  return devices.filter((d) => roomOfDevice(d) === room)
}

export function unassignedDevices(devices) {
  return devices.filter((d) => !roomOfDevice(d))
}

// A unit named after its room would just repeat the room heading.
export function displayName(device) {
  return device.name === roomOfDevice(device)?.name ? (TYPE_NAMES[device.type] ?? device.name) : device.name
}
