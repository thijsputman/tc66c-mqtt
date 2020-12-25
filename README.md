# TC66C &ndash; MQTT Bridge

Rough proof-of-concept for a RDTech TC66C (USB-C load meter with Bluetooth LE)
to MQTT bridge.

Goal is to keep track of my Raspberry Pi4's electrical load in Home Assistant.

For now it just publishes a single measurement of voltage, current and power to
the `tc66c/...` topic and exits.

## Installation

1. `npm install`
2. See the instructions at https://github.com/chrvadala/node-ble on how to
   properly setup `node-ble`.

## Usage

```bash
node test.js <tc66c-ble-mac-address> <mqtt-broker>

# Subscribe to the topic in another shell (using Mosquitto)
mosquitto_sub -h <mqtt-broker> -t "tc66c/#"
```

## References

1. https://sigrok.org/wiki/RDTech_TC66C
