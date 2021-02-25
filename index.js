#!/usr/bin/env node
"use strict";

const parseArgs = require("minimist");
const log = require("loglevel");
const logPrefix = require("loglevel-plugin-prefix");
const chalk = require("chalk");
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

class RuntimeError extends Error {}

const logColours = {
  DEBUG: chalk.cyan,
  INFO: chalk.blue,
  WARN: chalk.magenta,
  ERROR: chalk.red,
};

logPrefix.reg(log);
logPrefix.apply(log, {
  format(level, name, timestamp) {
    return `${chalk.gray(`[${timestamp}]`)} ${logColours[level](level)}:`;
  },
  levelFormatter(level) {
    return level.toUpperCase();
  },
  timestampFormatter(date) {
    return date.toISOString();
  },
});

const config = {
  bleAddress: "",
  mqttBroker: "",
  interval: 2000,
  logLevel: "info",
  deviceAlias: "",
};
const argv = parseArgs(process.argv.slice(2));

// Allow for positional --bleAddress and --mqttBroker
config.bleAddress = argv.bleAddress || argv._[0];
config.mqttBroker = argv.mqttBroker || argv._[1];

if (["debug", "info", "warn", "error"].indexOf(argv.logLevel) > -1) {
  config.logLevel = argv.logLevel;
}

log.setLevel(config.logLevel);

if (!config.bleAddress || !config.mqttBroker) {
  log.error("Incomplete configuration", config);
  process.exit(1);
}

if (typeof argv.interval !== "undefined") {
  config.interval = Number(argv.interval);
}
if (typeof argv.deviceAlias === "undefined") {
  argv.deviceAlias = config.bleAddress.toLowerCase();
}
config.deviceAlias = String(argv.deviceAlias).replace(/[\W]+/g, "_");

/**
 * Get receive-characteristic and requestData-helper from the TC66C-device.
 *
 * @param {import("node-ble").Device} device
 * @return {DeviceCharacteristics}
 */
const getDeviceCharacteristics = async (device) => {
  let txChr;
  let rxChr;
  let commandType = "command";

  const requestData = async () => {
    await txChr.writeValue(Buffer.from("bgetva\r\n", "ascii"), {
      type: commandType,
    });
  };

  const gatt = await device.gatt();
  const services = await gatt.services();

  const primary = await gatt.getPrimaryService(
    "0000ffe0-0000-1000-8000-00805f9b34fb"
  );

  // Firmware <= 1.14
  if (services.includes("0000ffe5-0000-1000-8000-00805f9b34fb")) {
    commandType = "reliable";
    rxChr = await primary.getCharacteristic(
      "0000ffe4-0000-1000-8000-00805f9b34fb"
    );
    const txPrimary = await gatt.getPrimaryService(
      "0000ffe5-0000-1000-8000-00805f9b34fb"
    );
    txChr = await txPrimary.getCharacteristic(
      "0000ffe9-0000-1000-8000-00805f9b34fb"
    );
  }
  // Firmware >= 1.15
  else {
    rxChr = await primary.getCharacteristic(
      "0000ffe1-0000-1000-8000-00805f9b34fb"
    );
    txChr = await primary.getCharacteristic(
      "0000ffe2-0000-1000-8000-00805f9b34fb"
    );
  }

  /**
   * @typedef {Object} DeviceCharacteristics
   * @property {import("node-ble").GattCharacteristic} rxChr - Receive characteristic
   * @property {Function} requestData - Request data from device
   */
  return { rxChr: rxChr, requestData: requestData };
};

/**
 * Receive data (i.e. measurements) from the TC66C-device.
 *
 * Data is send in several "bursts", amounting to a total of 192 bytes of data.
 * A single Buffer (with a length of 192 bytes) is returned.
 *
 * @param {import("node-ble").GattCharacteristic} rxChr Receive characteristic
 * @return {Promise<Buffer>}
 * @throws {RuntimeException} If total buffer length exceeds 192 bytes.
 */
const receiveBuffer = (rxChr) => {
  const response = [];
  let length = 0;
  return new Promise((resolve, reject) => {
    const onValueChanged = (buffer) => {
      response.push(buffer);
      length += buffer.length;
      log.debug("Received", length, "bytes");
      if (length >= 192) {
        /*
         * The nature of the receiveBuffer implementation requires us to add a
         * new listener at each invocation. Here we remove the current listener
         * to prevent receiving duplicate data (and a massive memory-leak)...
         */
        rxChr.removeListener("valuechanged", onValueChanged);
        if (length === 192) {
          resolve(Buffer.concat(response));
        }
        reject(new RuntimeError(`Buffer length ${length} exceeds 192`));
      }
    };
    rxChr.on("valuechanged", onValueChanged);
  });
};

const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const waitRuntimeError = (ms, error = new RuntimeError()) => {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      reject(error);
    }, ms)
  );
};

const sendMQTT = async (mqttClient, messages) => {
  for (const [topic, value] of messages) {
    log.info(topic, value);
    await mqttClient.publish(topic, value.toString());
  }
};

let data;
let exitLoop = false;
let exitCode = 0;

/*
 * Promise that resolves on SIGTERM – it enables "exitLoop", thus ending the
 * main loop. In several places, other Promises are raced against this one to
 * ensure we terminate immediately upon receiving SIGTERM and not await
 * (i.e. block) on the long running operation in the other Promise(s).
 * Note the _intentional_ use of "once" (instead of "on"). We only capture
 * SIGTERM once; allowing further events to be captured by the runtime (which
 * will "ungracefully" terminate execution). This way, if we mess up the our
 * exit routine, repeating the signal causes the runtime to take over.
 */
const resolveOnSIGTERM = new Promise((resolve) => {
  process.once("SIGTERM", () => {
    log.warn("Interrupt received; attempting to start graceful exit");
    exitLoop = true;
    resolve();
  });
});

// Turn SIGINT (Ctrl+C) into SIGTERM
process.once("SIGINT", () => {
  process.emit("SIGTERM");
});

(async () => {
  const adapter = await bluetooth.defaultAdapter();
  log.debug("Is Bluetooth powered?", await adapter.isPowered());

  // Discovery is required to reliably connect
  if (!(await adapter.isDiscovering())) {
    log.debug("Bluetooth-discovery started...");
    await adapter.startDiscovery();
  }

  let device;
  let deviceName = "<unknown>";
  let mqttClient;
  // Initialise MQTT Promise as no-op (i.e. resolve immediately)
  let mqttPromise = new Promise((resolve) => {
    resolve();
  });

  try {
    log.info("Connecting to %s, this may take a while...", config.bleAddress);
    device = await Promise.race([
      adapter.waitDevice(config.bleAddress),
      resolveOnSIGTERM,
      waitRuntimeError(
        30000,
        new RuntimeError(
          `Time-out while waiting for ${config.bleAddress} to respond`
        )
      ),
    ]);

    if (typeof device === "undefined") {
      throw new RuntimeError(
        `Device ${config.bleAddress} not available, aborting`
      );
    }

    await Promise.race([
      device.connect(),
      resolveOnSIGTERM,
      waitRuntimeError(
        30000,
        new RuntimeError(`Time-out while connecting to ${config.bleAddress}`)
      ),
    ]);
    deviceName = await device.getName();

    /*
     * Stop discovery once we've connected to the device. If we don't to do
     * this, discovery remains active, causing major interference on the 2.4 GHz
     * band (i.e. if the RPi is connected via 2.4 GHz WiFi, connectivity starts
     * to lag like crazy).
     */
    if (await adapter.isDiscovering()) {
      log.debug("Bluetooth-discovery stopped");
      await adapter.stopDiscovery();
    }

    mqttClient = await MQTT.connectAsync(`tcp://${config.mqttBroker}`);
    log.info("Connected to MQTT broker at %s", `tcp://${config.mqttBroker}`);

    log.debug("Requesting characteristics from %s...", deviceName);
    const { rxChr, requestData } = await Promise.race([
      getDeviceCharacteristics(device),
      resolveOnSIGTERM,
      waitRuntimeError(
        15000,
        new RuntimeError(
          `Time-out while retrieving characteristics from ${deviceName}`
        )
      ),
    ]);

    log.info(
      "Connected to Bluetooth-device %s; characteristics received",
      deviceName
    );

    while (true) {
      const start = process.hrtime.bigint();

      if (exitLoop) {
        break;
      }

      await rxChr.startNotifications();
      log.debug("Started listening for notifications from %s", deviceName);

      await requestData();
      log.debug("Send request for measurements to %s", deviceName);

      data = await Promise.race([
        receiveBuffer(rxChr),
        resolveOnSIGTERM,
        waitRuntimeError(
          5000,
          new RuntimeError(`Time-out while receiving data from ${deviceName}`)
        ),
      ]);
      await rxChr.stopNotifications();

      /*
       * No data received – most likely a SIGTERM was raised (which will cause
       * an exit at the start of the new loop). In case something else went
       * wrong, the next loop will most likely cause an error that will also
       * terminate execution.
       */
      if (typeof data === "undefined") continue;

      log.debug("Measurements received", data);

      const decipher = crypto.createDecipheriv(keyAlgorithm, key, "");
      const decrypted = decipher.update(data);
      const messages = [
        [
          `tc66c/${config.deviceAlias}/voltage_V`,
          decrypted.readInt32LE(48) * 1e-4,
        ],
        [
          `tc66c/${config.deviceAlias}/current_A`,
          decrypted.readInt32LE(52) * 1e-5,
        ],
        [
          `tc66c/${config.deviceAlias}/power_W`,
          decrypted.readInt32LE(56) * 1e-4,
        ],
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
        log.error(error);
        exitCode = 1;
        exitLoop = true;
      });

      const duration = Number((process.hrtime.bigint() - start) / 1000000n);
      log.info("Run duration", duration, "ms");

      if (config.interval === 0) continue;

      const waitFor = config.interval - duration;
      if (waitFor <= 0) {
        log.warn("Run took", Math.abs(waitFor), "ms too long, skipping wait");
        continue;
      }

      log.debug("Adjusting wait time to", waitFor, "ms");
      await Promise.race([wait(waitFor), resolveOnSIGTERM]);
    }
  } catch (error) {
    let message = error;
    if (error instanceof RuntimeError) {
      // For RuntimeError we don't care about the stack-trace
      message = error.message;
    }
    log.error(message);
    exitCode = 1;
  }

  log.info("Starting graceful exit with status code", exitCode);

  // Block on outstanding MQTT messages before disconnecting the client
  try {
    await mqttPromise;
  } catch (error) {
    // Promise (most likely) already rejected; no need to wait any further...
  }
  if (typeof mqttClient !== "undefined") {
    await mqttClient.end();
    log.info("Disconnected from MQTT broker");
  }

  try {
    if (await adapter.isDiscovering()) {
      log.debug("Bluetooth-discovery stopped");
      await adapter.stopDiscovery();
    }
    if (typeof device !== "undefined") {
      await device.disconnect();
      destroy();
      log.info("Disconnected from Bluetooth-device %s", deviceName);
    }
  } catch (error) {
    // Device (most likely) not connected (anymore); no need to bother...
  }

  process.exit(exitCode);
})();
