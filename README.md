# TC66C – MQTT Bridge

Proof-of-concept for a
[RDTech TC66C](https://www.aliexpress.com/item/32968303350.html) (USB-C load
meter with Bluetooth LE) to MQTT bridge.

Goal is to keep track of my Raspberry Pi4's electrical load in Home Assistant.

For now it just publishes a single measurement of voltage, current and power to
the `tc66c/...` topic and exits.

- [1. Prerequisites](#1-prerequisites)
- [2. Usage](#2-usage)
  - [2.1. Docker](#21-docker)
  - [2.2. Subscribe to MQTT Topic](#22-subscribe-to-mqtt-topic)
- [3. References](#3-references)

## 1. Prerequisites

Most likely works on any `aarch64` Linux-system with BlueZ properly configured.

The only tested/supported configuration is the following though:

1. Raspberry Pi 4 Model B
2. Ubuntu 20.04 or 20.10 (`aarch64`)
3. Working Bluetooth-stack (i.e. ensure you `apt install pi-bluetooth` and
   reboot)

## 2. Usage

1. `npm install`
2. Follow the [`node-ble`](https://github.com/chrvadala/node-ble) instructions
   to properly configure D-Bus.
3. `./index.js <tc66c-ble-mac-address> <mqtt-broker>`

### 2.1. Docker

Alternatively, you can use
[the pre-built Docker image](https://hub.docker.com/r/thijsputman/tc66c-mqtt).

In this case, there's no need to `npm install` nor to configure D-Bus.

You do need to load a custom AppArmor-policy prior to starting the container:

```shell
sudo apparmor_parser -r -W ./docker/docker-ble
```

And provide several environment variables:

`📄 .env`

```shell
TC66C_BLE_MAC=
MQTT_BROKER=
PUID=
PGID=
```

The `PUID` and `PGID` variables are optional. Specify them to have the script
run under a user other than root.

```shell
docker run -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket \
   --security-opt apparmor=docker-ble --env-file ./.env thijsputman/tc66c-mqtt:latest
```

See [`📄 docker/README.md`](./docker/README.md) for all the ins and outs with
regards to using Bluetooth in a Docker container.

### 2.2. Subscribe to MQTT Topic

Run the following command in another shell (or on another machine) to subscribe
to the `tc66c/#` topic (using Mosquitto) and validate the messages are sent out
properly.

```shell
mosquitto_sub -h <mqtt-broker> -t "tc66c/#"
```

## 3. References

1. https://sigrok.org/wiki/RDTech_TC66C
2. https://hub.docker.com/r/thijsputman/tc66c-mqtt
