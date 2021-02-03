# TC66C

## Firmware version 1.15

The TC66C devices that come with firmware version 1.15 appear to be a different
(Bluetooth) hardware revision. At the very least they use a different set of
characteristics:

- primary tx/rc: `0000ffe0-0000-1000-8000-00805f9b34fb`
- txChr: `0000ffe2-0000-1000-8000-00805f9b34fb`
- rxChr: `0000ffe1-0000-1000-8000-00805f9b34fb`

Currently, the script is unable to successfully communicate with this (hardware)
revision for two – (un)related? – reasons:

1. BlueZ via D-Bus (and thus node-ble) appears to be taking/using the wrong
   descriptor for the `txChr` making it impossible to write commands to the
   device
   - Using `gatttool` (while manually selecting the correct descriptor) I am
     able to successfully communicate commands to the device
2. Connecting with the device on my RPi4 is highly problematic: Multiple
   attempts (and quite some perseverance) are required to connect it through
   BlueZ via D-Bus; `hcitool` and `gatttool` are less problematic

Unsure if I simply got a bad device or if its an issue with the new
firmware(/hardware revision).
