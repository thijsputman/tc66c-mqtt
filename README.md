# TC66C &ndash; MQTT Bridge

Rough proof-of-concept for a RDTech TC66C (USB-C load meter with Bluetooth LE)
to MQTT bridge.

Goal is to keep track of my Raspberry Pi4's electrical load in Home Assistant.

For now it just echo's out the current "Current" (in `A * 10e-5`) reading...

## Installation

1. `npm install`
2. See the instructions at https://github.com/chrvadala/node-ble on how to
   properly setup `node-ble`.

## Usage

```bash
node test.js <tc66c-ble-mac-address>
```

## References

1. https://sigrok.org/wiki/RDTech_TC66C
