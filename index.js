#!/usr/bin/env node
"use strict";

const { createBluetooth } = require("node-ble");
const { bluetooth, destroy } = createBluetooth();
const MQTT = require("async-mqtt");
const crypto = require("crypto");

// prettier-ignore
const key = Buffer.from([
  0x58, 0x21, 0xfa, 0x56, 0x01, 0xb2, 0xf0, 0x26,
  0x87, 0xff, 0x12, 0x04, 0x62, 0x2a, 0x4f, 0xb0,
  0x86, 0xf4, 0x02, 0x60, 0x81, 0x6f, 0x9a, 0x0b,
  0xa7, 0xf1, 0x06, 0x61, 0x9a, 0xb8, 0x72, 0x88
]);
const keyAlgo = "aes-256-ecb";

const getDeviceChrs = (device) => {
  let resolved = false;
  return new Promise((resolve, reject) => {
    // 5 Second timeout on getting device characteristics
    setTimeout(() => {
      if (!resolved) {
        reject(new Error("Timeout"));
      }
    }, 5000);

    let txChr;
    let rxChr;

    (async () => {
      try {
        const gattServer = await device.gatt();

        const tx = await gattServer.getPrimaryService(
          "0000ffe5-0000-1000-8000-00805f9b34fb"
        );
        txChr = await tx.getCharacteristic(
          "0000ffe9-0000-1000-8000-00805f9b34fb"
        );
        const rx = await gattServer.getPrimaryService(
          "0000ffe0-0000-1000-8000-00805f9b34fb"
        );
        rxChr = await rx.getCharacteristic(
          "0000ffe4-0000-1000-8000-00805f9b34fb"
        );
      } catch (error) {
        reject(error);
      }

      resolved = true;
      resolve({ txChr: txChr, rxChr: rxChr });
    })();
  });
};

const receiveBuffer = (rxChr) => {
  const response = [];
  let length = 0;
  let resolved = false;
  return new Promise((resolve, reject) => {
    // 5 Second timeout on receiving data
    setTimeout(() => {
      if (!resolved) {
        reject(new Error("Timeout"));
      }
    }, 5000);
    /**
     * XXX: Not sure how nice of an approach this is...
     *
     * We need to remove the listener from our previous invocation(s) to prevent
     * them from lingering around (receiving data, but not acting upon them as
     * their containing promise already got resolved) and creating (what I
     * assume will be) a significant memory leak.
     * Could rewrite to lift the listener out of this function, but that would
     * needlessly complicate the logic?
     */
    rxChr.removeAllListeners("valuechanged");
    rxChr.on("valuechanged", (buffer) => {
      response.push(buffer);
      length += buffer.length;
      console.debug("Buffer length", length);
      if (length === 192) {
        resolved = true;
        resolve(response);
      } else if (length > 192) {
        reject(new Error(`Buffer length ${length} exceeded 192`));
      }
    });
  });
};

const delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const sendMQTT = async (broker, messages) => {
  const mqttClient = await MQTT.connectAsync(`tcp://${broker}`);

  for (const [topic, value] of messages) {
    console.info(topic, value);
    await mqttClient.publish(topic, value.toString());
  }

  await mqttClient.end();
};

let data;
let exitLoop = false;
let exitCode = 0;

process.on("SIGINT", () => {
  exitLoop = true;
});

(async () => {
  const adapter = await bluetooth.defaultAdapter();
  console.info("Is powered", await adapter.isPowered());

  // It appears discovery is needed to (reliably) connect...
  // Works without most of the time, but not always. Also, see note further down
  if (!(await adapter.isDiscovering())) {
    await adapter.startDiscovery();
  }

  const device = await adapter.waitDevice(process.argv[2]);

  try {
    await device.connect();
    console.info("Connected to", await device.getName());

    /*
     * XXX: This appears to be critical! If we don't stop discovery after
     * connecting it stays active, causing major interference on the 2.4 GHz
     * band (i.e. if the RPi is connected via 2.4 GHz WiFi, the SSH connection
     * starts to lag like crazy).
     */
    await adapter.stopDiscovery();

    const { txChr, rxChr } = await getDeviceChrs(device);

    while (true) {
      await rxChr.startNotifications();
      await txChr.writeValue(Buffer.from("bgetva\r\n", "ascii"));

      data = Buffer.concat(await receiveBuffer(rxChr));
      console.info("Buffer", data);

      await rxChr.stopNotifications();

      const decipher = crypto.createDecipheriv(keyAlgo, key, "");
      const decrypted = decipher.update(data);
      const messages = [];

      const voltageV = decrypted.readInt32LE(48) * 1e-4;
      messages.push(["tc66c/voltage_V", voltageV]);

      const currentA = decrypted.readInt32LE(52) * 1e-5;
      messages.push(["tc66c/current_A", currentA]);

      const powerW = decrypted.readInt32LE(56) * 1e-4;
      messages.push(["tc66c/power_W", powerW]);

      // TODO: Abort existing promise if it's still running when we get here again?

      sendMQTT(process.argv[3], messages);

      if (exitLoop) {
        break;
      }

      /*
       * TODO: Make configurable (and perhaps deterministic? i.e., include the
       * time needed for the measurement in the timeout, so we get a measurement
       * every x seconds, instead of every x seconds + however long it takes to
       * take the measurement).
       */

      await delay(2000);
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }

  await device.disconnect();
  destroy();

  process.exit(exitCode);
})();
