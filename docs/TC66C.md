# TC66C

## Firmware version 1.15

TC66C devices that come with firmware version 1.15 preinstalled appear to
contain new/different Bluetooth hardware. They use a different set of
characteristics:

- primary (transmit & receive): `0000ffe0-0000-1000-8000-00805f9b34fb`
- txChr: `0000ffe2-0000-1000-8000-00805f9b34fb`
- rxChr: `0000ffe1-0000-1000-8000-00805f9b34fb`

Furthermore, the `txChr` doesn't allow a `reliable`-write. Instead (and perhaps
more sensibly) it expects a `command`-write ("write without response" – see
<https://github.com/bluez/bluez/blob/master/doc/gatt-api.txt>).

Issuing a `reliable`-write causes a `ERROR: DBusError: Write not permitted` to
be raised. To be able to issue a `command`-write, at least
[`node-ble` 1.5.0](https://github.com/chrvadala/node-ble/pull/20) is required.
