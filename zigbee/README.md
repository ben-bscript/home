# Zigbee-lampen

De app bedient Zigbee-lampen via de **Sonoff Zigbee 3.0 USB Dongle Plus** (ZBDongle-E)
in de server:

```
lamp ⇄ Zigbee ⇄ Sonoff-dongle ⇄ Zigbee2MQTT ⇄ Mosquitto (MQTT) ⇄ home-server ⇄ app
```

[Zigbee2MQTT](https://www.zigbee2mqtt.io) praat met de dongle en zet elke lamp op een
MQTT-broker (Mosquitto). De home-server leest en stuurt de lampen daar
(`server/src/providers/zigbee.js`). Beide draaien in Docker.

## Installeren (eenmalig, op de Ubuntu-server)

1. Steek de dongle in de server, liefst met een USB-verlengkabel (USB 3-poorten en
   de server zelf storen het Zigbee-signaal). Schroef de antenne erop.
2. Haal de nieuwste code op en start Zigbee2MQTT:

   ```sh
   cd ~/home            # waar deze repository staat
   git pull
   npm install
   ./zigbee/install.sh
   ```

   Het script installeert Docker als dat nog niet bestaat, zoekt de dongle in
   `/dev/serial/by-id`, maakt `zigbee/data/configuration.yaml` aan en start
   Mosquitto + Zigbee2MQTT.
3. Herstart de home-app (`npm run dev`). Onder **Instellingen → Zigbee** staat nu
   *Verbonden*.

## Lampen toevoegen

1. **Instellingen → Zigbee → Nieuwe lampen zoeken** (het netwerk staat ruim 4 minuten open).
2. Zet de lamp in koppelmodus. Bij de meeste lampen (IKEA, Hue, Innr, LIDL…): de lamp
   5–6 keer snel aan- en uitschakelen tot hij knippert. Hue-lampen die al aan een
   Hue Bridge hingen moet je eerst resetten (Hue-app → lamp verwijderen, of met een
   Hue-dimmer: knop I+O 10 s ingedrukt dicht bij de lamp).
3. De lamp verschijnt onder *Lampen* op het overzicht. Tik erop om hem een naam en
   een kamer te geven.

Slimme relais en stekkers (bv. Sonoff ZBMINI) verschijnen ook, als aan/uit-lamp.

## Instellingen

In `server/.env` (alleen nodig als je afwijkt van de standaard):

```
ZIGBEE_MQTT_URL=mqtt://localhost:1883
ZIGBEE_BASE_TOPIC=zigbee2mqtt
```

## Problemen oplossen

- Logs: `sudo docker compose -f zigbee/docker-compose.yml logs -f zigbee2mqtt`
- De webinterface van Zigbee2MQTT staat op `http://<server-ip>:8080`.
- *Geen MQTT-broker*: `sudo docker compose -f zigbee/docker-compose.yml ps`. Draaien beide containers?
- *Zigbee2MQTT start niet / adapter-fout*: controleer `adapter:` in
  `zigbee/data/configuration.yaml` — `ember` voor de ZBDongle-E, `zstack` voor de
  ZBDongle-P. Op heel oude ZBDongle-E-firmware kan een
  [firmware-update](https://www.zigbee2mqtt.io/guide/adapters/emberznet.html) nodig zijn.
- Na een wijziging aan de configuratie: `sudo docker compose -f zigbee/docker-compose.yml restart zigbee2mqtt`.
