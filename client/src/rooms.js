// Rooms shown as tabs on the overview. List a device id under its room;
// devices that aren't listed anywhere end up in the room marked `rest`.
export const ROOMS = [
  { id: 'ouders', name: 'Ouders', devices: ['daikin:3e724752-a58c-44f8-b6b8-f17b8e42aa2b'] },
  { id: 'boris', name: 'Boris', devices: [], rest: true },
]

export function devicesInRoom(room, devices) {
  const assigned = new Set(ROOMS.flatMap((r) => r.devices))
  return devices.filter((d) => room.devices.includes(d.id) || (room.rest && !assigned.has(d.id)))
}

export function roomOfDevice(id) {
  return ROOMS.find((r) => r.devices.includes(id)) ?? ROOMS.find((r) => r.rest)
}
