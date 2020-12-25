const { createBluetooth } = require("node-ble");
const MQTT = require("async-mqtt");
const crypto = require("crypto");

// prettier-ignore
const key = Buffer.from([
  0x58, 0x21, 0xfa, 0x56, 0x01, 0xb2, 0xf0, 0x26,
  0x87, 0xff, 0x12, 0x04, 0x62, 0x2a, 0x4f, 0xb0,
  0x86, 0xf4, 0x02, 0x60, 0x81, 0x6f, 0x9a, 0x0b,
  0xa7, 0xf1, 0x06, 0x61, 0x9a, 0xb8, 0x72, 0x88
]);
const key_algo = "aes-256-ecb";

let data;

(async () => {
  const { bluetooth, destroy } = createBluetooth();

  const adapter = await bluetooth.defaultAdapter();

  const device = await adapter.waitDevice(process.argv[2]);
  await device.connect();

  try {
    const gattServer = await device.gatt();

    const tx = await gattServer.getPrimaryService(
      "0000ffe5-0000-1000-8000-00805f9b34fb"
    );
    const txChr = await tx.getCharacteristic(
      "0000ffe9-0000-1000-8000-00805f9b34fb"
    );
    const rx = await gattServer.getPrimaryService(
      "0000ffe0-0000-1000-8000-00805f9b34fb"
    );
    const rxChr = await rx.getCharacteristic(
      "0000ffe4-0000-1000-8000-00805f9b34fb"
    );

    const receiveBuffer = () => {
      let response = [];
      let length = 0;
      let resolved = false;
      // Time out after 5 seconds if receive promise is not resolved
      new Promise(() =>
        setTimeout(() => {
          if (!resolved) {
            throw "Timed out!";
          }
        }, 5000)
      );
      return new Promise((resolve) => {
        rxChr.on("valuechanged", (buffer) => {
          response.push(buffer);
          length += buffer.length;
          console.debug("Buffer length", length);
          if (length >= 192) {
            resolved = true;
            resolve(response);
          }
        });
      });
    };

    await rxChr.startNotifications();

    await txChr.writeValue(Buffer.from("bgetva\r\n", "ascii"));

    data = Buffer.concat(await receiveBuffer());
    console.debug(data);

    await rxChr.stopNotifications();
  } catch (error) {
    console.error(error);
  } finally {
    await device.disconnect();
    destroy();
  }

  let decipher = crypto.createDecipheriv(key_algo, key, "");
  let decrypted = decipher.update(data);

  let voltageV = decrypted.readInt32LE(48) * 1e-4;
  console.info("Voltage (V)", voltageV);

  let currentA = decrypted.readInt32LE(52) * 1e-5;
  console.info("Current (A)", currentA);

  let powerW = decrypted.readInt32LE(56) * 1e-4;
  console.info("Power (W)", powerW);

  const mqttClient = await MQTT.connectAsync(`tcp://${process.argv[3]}`);

  await mqttClient.publish("tc66c/volgate_V", voltageV.toString());
  await mqttClient.publish("tc66c/current_A", currentA.toString());
  await mqttClient.publish("tc66c/power_W", powerW.toString());

  await mqttClient.end();
})();
