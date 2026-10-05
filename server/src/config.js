import { fileURLToPath } from 'node:url'

export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  dataDir: fileURLToPath(new URL('../data/', import.meta.url)),
  location: { name: 'Broechem', latitude: 51.181, longitude: 4.602 },
  // Static address of the Renson Waves, used when it isn't found by scanning the network.
  renson: { host: process.env.RENSON_WAVES_HOST ?? '' },
  daikin: {
    clientId: process.env.DAIKIN_CLIENT_ID ?? '',
    clientSecret: process.env.DAIKIN_CLIENT_SECRET ?? '',
    // Daikin's firewall rejects redirect URIs containing "localhost" or an IP
    // address, so use a public DNS name that resolves to 127.0.0.1.
    redirectUri: process.env.DAIKIN_REDIRECT_URI ?? 'https://home.localtest.me:3443/api/auth/daikin/callback',
  },
}
