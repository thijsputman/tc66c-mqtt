# TC66C &ndash; MQTT Bridge

Rough proof-of-concept for a
[RDTech TC66C](https://www.aliexpress.com/item/32968303350.html) (USB-C load
meter with Bluetooth LE) to MQTT bridge.

Goal is to keep track of my Raspberry Pi4's electrical load in Home Assistant.

For now it just publishes a single measurement of voltage, current and power to
the `tc66c/...` topic and exits.

## Prerequisites

Tested on **Raspberry Pi 4 Model B** running Ubuntu 20.04 and 20.10 (`aarch64`).

Requires a working bluetooth stack (i.e. ensure you `apt install pi-bluetooth`
and reboot).

## Usage

1. `npm install`
2. Follow the [`node-ble`](https://github.com/chrvadala/node-ble) instructions
   to properly configure D-Bus.

```bash
./test.js <tc66c-ble-mac-address> <mqtt-broker>

# Subscribe to the topic in another shell (using Mosquitto)
mosquitto_sub -h <mqtt-broker> -t "tc66c/#"
```

### Docker

Alternatively, you can use
[a pre-built Docker image](https://hub.docker.com/r/thijsputman/tc66c-mqtt).

In this case, there's no need to `npm install` nor to configure D-Bus. You do
need to load a custom AppArmor-policy prior to starting the container...

```bash
# Load custom AppArmor-policy
sudo apparmor_parser -r -W ./docker/docker-ble

docker run -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket \
   --security-opt apparmor=docker-ble thijsputman/tc66c-mqtt:latest \
   /tc66c-mqtt/test.js <tc66c-ble-mac-address> <mqtt-broker>
```

See [`📄 docker/README.md`](./docker/README.md) for all the ins and outs with
regards to using Bluetooth in a Docker container.

## References

1. https://sigrok.org/wiki/RDTech_TC66C
2. https://hub.docker.com/r/thijsputman/tc66c-mqtt
