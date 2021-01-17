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
const keyAlgorithm = "aes-256-ecb";

// TODO: Move all argv and env handling here...
const delay = 2000;

const getDeviceCharacteristics = (device) => {
  let resolved = false;
  return new Promise((resolve, reject) => {
    // 5 Second timeout on getting device characteristics
    setTimeout(() => {
      if (!resolved) {
        reject(new Error("Timeout in getDeviceCharacteristics()"));
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
        reject(new Error("Timeout in receiveBuffer()"));
      }
    }, 5000);
    const onValueChanged = (buffer) => {
      response.push(buffer);
      length += buffer.length;
      console.debug("Received", length, "bytes");
      if (length >= 192) {
        /*
         * The nature of the receiveBuffer implementation requires us to add a
         * new listener at each invocation. Here we remove the current listener
         * to prevent receiving duplicate data (and a massive memory-leak)...
         */
        rxChr.removeListener("valuechanged", onValueChanged);
        if (length === 192) {
          resolved = true;
          resolve(response);
        }
        reject(new Error(`Buffer length ${length} exceeds 192`));
      }
    };
    rxChr.on("valuechanged", onValueChanged);
  });
};

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const sendMQTT = async (mqttClient, messages) => {
  for (const [topic, value] of messages) {
    console.info(topic, value);
    await mqttClient.publish(topic, value.toString());
  }
};

let data;
let exitLoop = false;
let exitCode = 0;

process.on("SIGINT", () => {
  console.debug(" 📞 Interrupt received; attempting graceful exit");
  exitLoop = true;
});

(async () => {
  const mqttClient = await MQTT.connectAsync(`tcp://${process.argv[3]}`);
  console.info("Connected to MQTT broker at %s", `tcp://${process.argv[3]}`);

  // Initialise MQTT Promise as no-op (i.e. resolve immediately)
  let mqttPromise = new Promise((resolve) => {
    resolve();
  });

  const adapter = await bluetooth.defaultAdapter();
  console.info("Is Bluetooth powered?", await adapter.isPowered());

  // It appears starting discovery is needed to (reliably) connect
  if (!(await adapter.isDiscovering())) {
    await adapter.startDiscovery();
  }

  console.info("Connecting to %s, this may take a while...", process.argv[2]);
  const device = await adapter.waitDevice(process.argv[2]);
  let deviceName = "<unknown>";

  try {
    await device.connect();
    deviceName = await device.getName();

    /*
     * It (again, appears) critical to stop discovery once we've connected to
     * the device. If we don't to do this, discovery remains active,causing
     * major interference on the 2.4 GHz band (i.e. if the RPi is connected via
     * 2.4 GHz WiFi, connectivity starts to lag like crazy).
     */
    await adapter.stopDiscovery();

    const { txChr, rxChr } = await getDeviceCharacteristics(device);

    console.info(
      "Connected to Bluetooth-device %s; characteristics received",
      deviceName
    );

    while (true) {
      const start = process.hrtime.bigint();

      await rxChr.startNotifications();
      await txChr.writeValue(Buffer.from("bgetva\r\n", "ascii"));
      console.debug("Send request for measurements to %s", deviceName);

      data = Buffer.concat(await receiveBuffer(rxChr));
      console.info("Measurements received", data);

      await rxChr.stopNotifications();

      const decipher = crypto.createDecipheriv(keyAlgorithm, key, "");
      const decrypted = decipher.update(data);
      const messages = [
        ["tc66c/voltage_V", decrypted.readInt32LE(48) * 1e-4],
        ["tc66c/current_A", decrypted.readInt32LE(52) * 1e-5],
        ["tc66c/power_W", decrypted.readInt32LE(56) * 1e-4],
      ];

      /*
       * Wait for existing Promise to resolve (i.e. only block if still sending
       * the previous set of messages).
       */
      await mqttPromise;
      mqttPromise = sendMQTT(mqttClient, messages);
      /*
       * We're not waiting for this to complete, so errors need to be handled
       * explicitly on the Promise (otherwise they'll crash us out of our main
       * loop the hard way).
       */
      mqttPromise.catch((error) => {
        console.error(error);
        exitCode = 1;
        exitLoop = true;
      });

      if (exitLoop) {
        break;
      }

      const duration = Number((process.hrtime.bigint() - start) / 1000000n);
      console.debug("Run duration", duration, "ms");

      const waitFor = delay - duration;
      if (waitFor <= 0) {
        console.debug("Run took too long, skipping wait");
        continue;
      }

      console.debug("Adjusting wait time to", waitFor, "ms");
      await wait(waitFor);
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }

  console.info("Graceful exit with status code", exitCode);

  // Block on outstanding MQTT messages before disconnecting the client
  try {
    await mqttPromise;
  } catch (error) {
    // Promise (most likely) already rejected; no need to wait any further...
  }
  await mqttClient.end();
  console.debug("Disconnected from MQTT broker");

  await device.disconnect();
  destroy();
  console.debug("Disconnected from Bluetooth-device %s", deviceName);

  process.exit(exitCode);
})();
