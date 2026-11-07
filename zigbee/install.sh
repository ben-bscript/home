#!/usr/bin/env bash
# Installs and starts Zigbee2MQTT + Mosquitto for the Sonoff Zigbee dongle.
# Run on the home server with the dongle plugged in: ./zigbee/install.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker installeren…"
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
fi

adapter=$(ls -d /dev/serial/by-id/* 2>/dev/null | grep -i -m1 -E 'sonoff|itead|zigbee' || true)
if [ -z "$adapter" ]; then
  echo "Geen Zigbee-dongle gevonden in /dev/serial/by-id. Steek de Sonoff-dongle in (liefst via een USB-verlengkabel) en probeer opnieuw." >&2
  ls -l /dev/serial/by-id 2>/dev/null || true
  exit 1
fi
echo "Dongle gevonden: $adapter"

# The ZBDongle-E (EFR32MG21, "..._Dongle_Plus_V2_...") uses the ember driver;
# the older ZBDongle-P (CC2652P, CP2102N "Silicon_Labs" USB chip) uses zstack.
driver=ember
case "$adapter" in *Silicon_Labs*) driver=zstack ;; esac

echo "ZIGBEE_ADAPTER=$adapter" > .env
mkdir -p data
if [ ! -f data/configuration.yaml ]; then
  sed "s/adapter: ember/adapter: $driver/" configuration.example.yaml > data/configuration.yaml
  echo "data/configuration.yaml aangemaakt (adapter: $driver)"
fi

# ModemManager probes new serial ports and can lock up the dongle.
if systemctl is-active --quiet ModemManager 2>/dev/null; then
  echo "ModemManager uitschakelen (stoort de dongle)…"
  sudo systemctl disable --now ModemManager
fi

sudo docker compose pull
sudo docker compose up -d
echo
echo "Zigbee2MQTT draait. Webinterface: http://$(hostname -I | awk '{print $1}'):8080"
echo "Logs bekijken: sudo docker compose -f $(pwd)/docker-compose.yml logs -f zigbee2mqtt"
