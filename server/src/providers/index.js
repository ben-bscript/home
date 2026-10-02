import * as daikin from './daikin.js'

// Add new device integrations here. Each provider exports:
// id, name, status(), getAuthUrl(state), exchangeCode(code), listDevices({ force }),
// sendCommand(deviceId, command, value), disconnect()
export const providers = { [daikin.id]: daikin }
