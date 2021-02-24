# TC66C

The [TC66C](https://www.aliexpress.com/item/32968303350.html) is a USB-C load
meter that communicates its measurements over Bluetooth Low Energy.

![TC66C diagram](./TC66C_buttons.jpg)

## Hardware/firmware revision 1.15

TC66C units that come with firmware version 1.15 preinstalled appear to contain
new/different Bluetooth hardware.

They use a different set of characteristics:

- primary (transmit & receive): `0000ffe0-0000-1000-8000-00805f9b34fb`
- txChr: `0000ffe2-0000-1000-8000-00805f9b34fb`
- rxChr: `0000ffe1-0000-1000-8000-00805f9b34fb`

Furthermore, the `txChr` doesn't allow a `reliable`-write. Instead (and perhaps
more sensibly) it expects a `command`-write ("write without response" – see
<https://github.com/bluez/bluez/blob/master/doc/gatt-api.txt>).

Issuing a `reliable`-write causes a `ERROR: DBusError: Write not permitted` to
be raised. To be able to issue a `command`-write, at least
[`node-ble` 1.5.0](https://github.com/chrvadala/node-ble/pull/20) is required.

**N.B.** the older units _require_ a `reliable`-write to function properly (they
will not issue an error when send a `command`-write, but won't produce any data
as a result either).

Apart from the above two changes, all other aspects (including the AES
decryption-key) remain unchanged.

## References

1. <https://ralimtek.com/reverse%20engineering/software/tc66c-reverse-engineering/>
2. <https://sigrok.org/wiki/RDTech_TC66C>
