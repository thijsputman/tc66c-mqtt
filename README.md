<!-- markdownlint-disable no-inline-html -->
<p style="position:inline-block; width:100%; text-align:right">
  <img
    src="https://github.com/thijsputman/tc66c-mqtt/workflows/Lint%20codebase/badge.svg"
    title="Lint codebase"/>
  <img
    src="https://github.com/thijsputman/tc66c-mqtt/workflows/Build%20and%20push%20to%20Docker%20Hub/badge.svg"
    title="Build and push to Docker Hub"/>
</p>
<!-- markdownlint-enable no-inline-html -->

# TC66C – MQTT Bridge

Proof-of-concept for a
[RDTech TC66C](https://www.aliexpress.com/item/32968303350.html) (USB-C load
meter with Bluetooth LE) to MQTT bridge. Simultaneously, a playground for me to
get more familiar with some advanced Docker/container concepts.

The ultimate goal is to keep track of my Raspberry Pi4's electrical load in Home
Assistant.

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

The easiest way to get it up and running is via `docker-compose`:

`📄 docker-compose.yml`

```yaml
version: "3.7"
services:
  tc66c-mqtt:
    image: thijsputman/tc66c-mqtt:latest
    security_opt:
      - apparmor=docker-ble
    volumes:
      - /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket
    environment:
      - TC66C_BLE_MAC=
      - MQTT_BROKER=
      - PUID=
      - PGID=
```

Fill out `TC66C_BLE_MAC` (TC66C's MAC address) and `MQTT_BROKER` (hostname or IP
address). The `PUID` and `PGID` variables are optional. Specify them to have the
script run under a user other than `root`.

For this to work, you do need to load a custom AppArmor-policy prior to starting
the container:

```shell
sudo apparmor_parser -r -W ./docker/docker-ble
```

The AppArmor-policy needs to be reloaded after each system boot. There are many
ways to automate this, one would be:

```shell
sudo mkdir -p /etc/apparmor.d/containers && sudo cp ./docker/docker-ble "$_"
sudo crontab -e
# Insert the following into the crontab:
@reboot  /usr/sbin/apparmor_parser -r -W /etc/apparmor.d/containers/docker-ble
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

1. <https://sigrok.org/wiki/RDTech_TC66C>
2. <https://hub.docker.com/r/thijsputman/tc66c-mqtt>
3. [`📄 TODO`](/TODO)
