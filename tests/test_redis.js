const redis = require('redis');
const config = require('/etc/vps/config.json');

const rclient = redis.createClient({
  socket: {
    host: config.HOST,
    port: config.PORT,
  },
});


const subscriber = rclient.duplicate();

async function addKey() {
  const res = await rclient.set('test key 1234567890 1234567890 1234567890', '0');
  console.log('returns "OK" if successful.', res);
}

async function addList() {
  let res = await rclient.hSet('test list 1234567890 1234567890 1234567890', '0', '2');
  console.log('returns "OK" if successful.', res);
}

async function getKey() {
  const res = await rclient.get('test key 1234567890 1234567890 1234567890', '0');
  console.log('gives a value if there.', res);

  const res1 = await rclient.get('test key 1234567890 1234567890', '0');
  console.log('returns null if not there.', res1);
}

async function removeKey() {
  let res = await rclient.del('test key 1234567890 1234567890 1234567890', '0');
  console.log('returns how many have been deleted.', res);

  res = await rclient.del('test key 1234567890 1234567890', '0');
  console.log('returns 0 if no key.', res);

  // Removes the specified fields from the hash stored at key.
  // Specified fields that do not exist within this hash are ignored.
  // If key does not exist, it is treated as an empty hash and this command returns 0.
  addList();
  res = await rclient.hDel('test key 1234567890 1234567890 1234567890', '1');
  console.log('deleting a non exiting v', res);

  res = await rclient.hDel('test list 1234567890 1234567890 1234567890', '0');
  console.log('deletes existing value. returns how many removed.', res);

  res = await rclient.hDel('test key 1234567890 1234567890', '0');
  console.log('returns 0 if no key.', res);

  await rclient.publish('hbs', 'hbs message content');
  await rclient.publish('tops', 'tops message content');
}

async function sub() {
  await subscriber.subscribe('hbs', (message) => {
    console.log(`Received hbs message: ${message}`);
  });
  await subscriber.subscribe('tops', (message) => {
    console.log(`Received tops message: ${message}`);
  });
}

async function main() {
  rclient.on('connect', async () => {
    console.log('redis connected OK.');
  }).on('error', (err) => {
    console.log(`Error ${err}`);
  });

  await rclient.connect();
  await subscriber.connect();

  sub();
  addKey();
  getKey();
  removeKey();
}

main();
