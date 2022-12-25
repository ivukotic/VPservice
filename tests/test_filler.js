const { range } = require('lodash');
const redis = require('redis');
const Keys = require('./keys');
const config = require('/etc/vps/config.json');

const rclient = redis.createClient({
  socket: {
    host: config.HOST,
    port: config.PORT,
  },
});

async function getKey() {
  const replyMove = await rclient.rPopLPush(Keys.Unasigned, 'remove_me');
  console.log(replyMove);
  if (!replyMove) {
    console.warn('this should not happen. L423');
  }
}

async function main() {
  rclient.on('connect', async () => {
    console.log('redis connected OK.');
  }).on('error', (err) => {
    console.log(`Error ${err}`);
  });
  await rclient.connect();
  for (let i in range(100)) {
    getKey();
  }
}

main();
