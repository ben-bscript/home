import * as daikin from './daikin.js'
import * as renson from './renson.js'

// Add new device integrations here. Each provider exports:
// id, name, status(), getAuthUrl(state), exchangeCode(code), listDevices({ force }),
// sendCommand(deviceId, command, value), disconnect()
// Local providers (status().local) also export discover() and start().
export const providers = { [daikin.id]: daikin, [renson.id]: renson }
