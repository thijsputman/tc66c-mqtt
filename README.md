<!-- markdownlint-disable no-inline-html -->
<p>
  <img
    src="https://github.com/thijsputman/tc66c-mqtt/workflows/Lint%20codebase/badge.svg?branch=main"
    title="Lint codebase" align="right"/>
  <img
    src="https://github.com/thijsputman/tc66c-mqtt/workflows/Docker/badge.svg?branch=main"
    title="Docker" align="right"/>
</p>
<!-- markdownlint-enable no-inline-html -->

# TC66C – MQTT Bridge

A simple TC66C to MQTT bridge I'm using to keep track of my Raspberry Pi4's
electrical load in
[Home Assistant](https://github.com/thijsputman/home-assistant-config).

Simultaneously, a playground for me to get more familiar with some advanced
Docker/container concepts and to dust off my Node.js knowledge.

It publishes measurements of voltage, current and power to the `tc66c/` topic at
a configurable interval.

- [Prerequisites](#prerequisites)
- [Usage](#usage)
  - [Docker](#docker)
- [Subscribe to the MQTT Topic](#subscribe-to-the-mqtt-topic)
- [References](#references)

## Prerequisites

The TC66C is a USB-C load meter that communicates its measurements over
Bluetooth Low Energy –
[you'll need one of them](https://www.aliexpress.com/item/32968303350.html) to
be able to retrieve any actual measurements...

The code most likely works on any Linux-system with BlueZ properly configured.
The only tested/supported configuration is the following though:

1. Raspberry Pi 4 Model B
2. Ubuntu 20.04 or 20.10 (`aarch64`)
   - Ensure you Bluetooth-stack is working (i.e. `apt install pi-bluetooth` and
     reboot)

## Usage

1. `npm install`
2. Follow the [`node-ble`](https://github.com/chrvadala/node-ble) instructions
   to properly configure D-Bus
3. `./index.js ble-address mqtt-broker [--interval ms] [--logLevel level]`

The default `--interval` at which measurements are fetched and returned is 2,000
ms. Use `--interval 0` to disable the interval and fetch measurements as fast as
possible (on my RPi4 this maxes out at around 800 ms).

The default `--logLevel` is `info`. You can optionally change it into `debug` to
get (a lot) more output, or to `warn` or `error` to get virtually no feedback.

### Docker

Alternatively, you can use
[the pre-built Docker image](https://hub.docker.com/r/thijsputman/tc66c-mqtt).
Note that the Docker image currently is only available for **`aarch64`**!

In this case, there's no need to `npm install` nor to configure D-Bus.

For things to work in Docker, you _do_ need to load
[a custom AppArmor-policy](./docker/docker-ble) prior to starting the container:

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

Once you've loaded the AppArmor-policy, the easiest way to get it up and running
is via `docker-compose up [-d]`:

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
    # - M_INTERVAL=
    # - LOG_LEVEL=
    # - PUID=
    # - PGID=
```

#### Environment variables

- `TC66C_BLE_MAC` – Bluetooth MAC address of your TC66C
- `MQTT_BROKER` – Hostname or IP address of your MQTT broker
- `M_INTERVAL` – Optional; measurement interval (in milliseconds)
  - Leaving it empty will use the default interval of 2,000 ms
  - Set it to `0` to retrieve measurements as fast as possible
- `LOG_LEVEL` – Optional; logging verbosity
  - Defaults to `info`; alternatives are `debug`, `warn` and `error`
- `PUID` & `PGID` – Optional; run under the specified UID and GID (instead of as
  `root`)

See [`📄 docker/README.md`](./docker/README.md#docker-and-bluetooth) for all the
ins and outs with regards to using Bluetooth in a Docker container.

## Subscribe to the MQTT Topic

Run the following command in another shell (or on another machine) to subscribe
to the `tc66c/#` topic (using [Mosquitto](https://mosquitto.org/)) and validate
the messages are sent out properly.

```shell
mosquitto_sub -h <mqtt-broker> -t "tc66c/#"
```

## References

1. <https://sigrok.org/wiki/RDTech_TC66C>
2. <https://hub.docker.com/r/thijsputman/tc66c-mqtt>
3. [`📄 TODO`](./TODO)
4. [`📄 docker/README.md`](./docker/README.md)
