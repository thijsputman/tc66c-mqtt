const {createBluetooth} = require('node-ble');
const crypto = require('crypto');

const key = Buffer.from([
  0x58, 0x21, 0xfa, 0x56, 0x01, 0xb2, 0xf0, 0x26,
  0x87, 0xff, 0x12, 0x04, 0x62, 0x2a, 0x4f, 0xb0,
  0x86, 0xf4, 0x02, 0x60, 0x81, 0x6f, 0x9a, 0x0b,
  0xa7, 0xf1, 0x06, 0x61, 0x9a, 0xb8, 0x72, 0x88]);
const key_algo = 'aes-256-ecb';

const response = [];

(async () => {

  const {bluetooth, destroy} = createBluetooth();

  const adapter = await bluetooth.defaultAdapter();

  const device = await adapter.waitDevice(process.argv[2]);
  await device.connect();

  try{

    const gattServer = await device.gatt();

    const tx = await gattServer.getPrimaryService('0000ffe5-0000-1000-8000-00805f9b34fb');
    const txChr = await tx.getCharacteristic('0000ffe9-0000-1000-8000-00805f9b34fb');
    const rx = await gattServer.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
    const rxChr = await rx.getCharacteristic('0000ffe4-0000-1000-8000-00805f9b34fb');

    await rxChr.startNotifications();
    rxChr.on('valuechanged', buffer => {
      console.log(buffer);
      response.push(buffer);
    });

    await txChr.writeValue(Buffer.from("bgetva\r\n", "ascii"));

    console.log("start wait");

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("end wait");

    await rxChr.stopNotifications();

  }
  catch(error){
    console.error(error);
  }
  finally{
    await device.disconnect();
    destroy();
    console.log("destroyed");

    let data = Buffer.concat(response);
    console.log(data);

    let decipher = crypto.createDecipheriv(key_algo, key, '');
    let decrypted = decipher.update(data);

    console.log('Current (10e-5)', decrypted.readInt32LE(52));
  }
})();
